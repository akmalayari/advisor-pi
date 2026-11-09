# Changelog

## 1.2.0-cachefix.1

Forked from `advisor-pi` 1.2.0 (luongnv89/pi-extensions@f1e4f61).

### Fixed

- Keep the executor system prompt stable across advisor calls. The guidance
  that `advisor-pi` appends to the system prompt included the remaining use
  count, so it changed after every advisor call. Because the system prompt sits
  ahead of the conversation in the request, the next message after any advisor
  call missed the provider's prompt cache for the entire conversation history.
  The guidance now states the per-branch limit only; each advisor result still
  starts with `used/max`, and the tool still reports when the limit is reached.
