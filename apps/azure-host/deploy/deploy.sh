#!/usr/bin/env bash
# Deploys the OpenCraw host to Azure: a resource group, a storage account, a
# container registry, an Elastic Premium plan, and the Function App running
# the container image, which pulls from the registry with its managed identity.
#
# Run it from the repository root, logged in (`az login`), after
#   npx nx run @opencraw/azure-host:prune
# Re-running it builds and rolls out a new image; the resources are reused.
#
#   OPENCRAW_NAME=mycrawler OPENCRAW_LOCATION=westeurope apps/azure-host/deploy/deploy.sh
set -euo pipefail

NAME="${OPENCRAW_NAME:?set OPENCRAW_NAME: a short, lowercase, globally unique name (letters and digits)}"
LOCATION="${OPENCRAW_LOCATION:-westeurope}"
GROUP="${OPENCRAW_GROUP:-rg-$NAME}"
STORAGE="${OPENCRAW_STORAGE_ACCOUNT:-st${NAME//-/}}"
REGISTRY="${OPENCRAW_REGISTRY:-cr${NAME//-/}}"
PLAN="plan-$NAME"
APP="func-$NAME"
TAG="${OPENCRAW_TAG:-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="$REGISTRY.azurecr.io/opencraw-host:$TAG"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$HERE/dist/package-lock.json" ]]; then
  echo "No pruned build in $HERE/dist: run 'npx nx run @opencraw/azure-host:prune' first." >&2
  exit 1
fi

echo "→ Resource group $GROUP ($LOCATION)"
az group create --name "$GROUP" --location "$LOCATION" --output none

echo "→ Storage account $STORAGE: Durable's task hub, published recipes, large results"
az storage account create --name "$STORAGE" --resource-group "$GROUP" --location "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --min-tls-version TLS1_2 --output none

echo "→ Container registry $REGISTRY, and the image built in it"
az acr create --name "$REGISTRY" --resource-group "$GROUP" --location "$LOCATION" --sku Basic --output none
az acr build --registry "$REGISTRY" --image "opencraw-host:$TAG" "$HERE"

echo "→ Elastic Premium plan $PLAN: one always-ready instance, no scale-out"
# A warm pool lives in one process: one instance keeps one pool per crawl id,
# and one outbound IP per site. Scale up (EP2, EP3) for more windows.
az functionapp plan create --name "$PLAN" --resource-group "$GROUP" --location "$LOCATION" \
  --sku EP1 --is-linux --min-instances 1 --max-burst 1 --output none

echo "→ Function App $APP"
if ! az functionapp show --name "$APP" --resource-group "$GROUP" --output none 2>/dev/null; then
  az functionapp create --name "$APP" --resource-group "$GROUP" --plan "$PLAN" \
    --storage-account "$STORAGE" --functions-version 4 --image "$IMAGE" \
    --assign-identity '[system]' --output none
fi
APP_ID="$(az functionapp show --name "$APP" --resource-group "$GROUP" --query id --output tsv)"
PRINCIPAL="$(az functionapp identity show --name "$APP" --resource-group "$GROUP" --query principalId --output tsv)"
REGISTRY_ID="$(az acr show --name "$REGISTRY" --query id --output tsv)"

echo "→ Let the app pull from the registry with its managed identity"
az role assignment create --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$REGISTRY_ID" --output none 2>/dev/null || true
az resource update --ids "$APP_ID/config/web" --set properties.acrUseManagedIdentityCreds=true --output none
az functionapp config container set --name "$APP" --resource-group "$GROUP" \
  --image "$IMAGE" --registry-server "https://$REGISTRY.azurecr.io" --output none

echo "→ One instance at most, and the host's settings"
az resource update --ids "$APP_ID/config/web" --set properties.functionAppScaleLimit=1 --output none
az functionapp config appsettings set --name "$APP" --resource-group "$GROUP" --output none --settings \
  "OPENCRAW_ALLOWED_HOSTS=${OPENCRAW_ALLOWED_HOSTS:-books.toscrape.com}" \
  "OPENCRAW_MCP=${OPENCRAW_MCP:-true}" \
  "OPENCRAW_PROMOTERS=${OPENCRAW_PROMOTERS:-}" \
  "OPENCRAW_MAX_WINDOWS=${OPENCRAW_MAX_WINDOWS:-4}" \
  "OPENCRAW_POOL_IDLE_MINUTES=${OPENCRAW_POOL_IDLE_MINUTES:-10}"

echo "→ Restart on the new image"
az functionapp restart --name "$APP" --resource-group "$GROUP" --output none

HOST="$(az functionapp show --name "$APP" --resource-group "$GROUP" --query defaultHostName --output tsv)"
cat <<DONE

Deployed $IMAGE to https://$HOST

  The function key (send it as the x-functions-key header, or ?code=):
    az functionapp keys list --name $APP --resource-group $GROUP --query functionKeys.default --output tsv

  Try it:
    curl -X POST "https://$HOST/api/crawl?code=<key>" -H 'content-type: application/json' \\
      -d '{"recipe":{"name":"books-by-category","version":"1"}}'

  The MCP endpoint, for an MCP client: https://$HOST/api/mcp?code=<key>
DONE
