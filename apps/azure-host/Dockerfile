# The OpenCraw host as an Azure Functions container: Node 22, the Functions
# runtime, Chromium for web recipes. Build it from the pruned output, which
# carries its own lockfile and the workspace packages it depends on:
#
#   npx nx run @opencraw/azure-host:prune
#   docker build -t opencraw-host apps/azure-host
#
# Chromium needs a plan that runs containers: Elastic Premium or App Service
# (Linux). The Consumption plan cannot run it.
FROM mcr.microsoft.com/azure-functions/node:4-node22

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /home/site/wwwroot

# Dependencies first, so a code change reuses this layer.
COPY dist/package.json dist/package-lock.json ./
COPY dist/workspace_modules ./workspace_modules
RUN npm ci --omit=dev --ignore-scripts \
 && npx playwright install --with-deps chromium \
 && npm cache clean --force

COPY host.json ./
COPY dist/*.js ./dist/
COPY dist/functions ./dist/functions
COPY dist/assets ./dist/assets
