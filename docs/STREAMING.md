# Streaming Model

Prawr does not host or transcode video in V1. It expects a valid embedded live video source and focuses on payment enforcement around valid playback.

## Lifecycle

- stream created
- creator marks stream as live or scheduled
- viewer authorizes session spending
- backend validates playback
- receipts are generated and verified
- final settlement occurs after aggregation

## Session rules

Valid watch time is based on verified playback events, not a simple client timer. Sessions pause when playback pauses, buffer events trigger measurement adjustments, and background tabs may be discounted according to the backend business rule.
