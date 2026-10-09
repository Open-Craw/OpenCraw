class HookPending(Exception):
    """Raised by a hook handler whose work is not done yet.

    ``serve_hook`` turns it into a ``pending`` answer: OpenCraw runs the hook again, after
    ``retry_after_ms`` (a second when it is ``None``), with the same ``idempotencyKey``, until the
    handler returns or the hook's ``maxWaitMs`` passes. Start the work the first time, and look it up
    by ``request["idempotencyKey"]`` on the later calls.
    """

    def __init__(self, retry_after_ms: int | None = None) -> None:
        super().__init__("pending")
        self.retry_after_ms = retry_after_ms
