# Streaming Model

Prawr does not host or transcode video in V1. It expects a valid embedded live video source and focuses on payment enforcement around valid playback.

## Lifecycle

- stream created
- YouTube video and Twitch channel statuses are refreshed every 60 seconds when provider credentials are configured
- ended streams are marked offline and removed from public discovery
- viewer authorizes session spending
- backend validates playback
- receipts are generated and verified
- final settlement occurs after aggregation

YouTube status checks support video URLs such as `youtube.com/watch?v=...`,
`youtube.com/live/...`, and `youtu.be/...`. Twitch checks support channel URLs
such as `twitch.tv/channel`. Set `YOUTUBE_API_KEY` and/or `TWITCH_CLIENT_ID` plus
`TWITCH_CLIENT_SECRET` in the backend environment. Provider API failures leave
the last known status unchanged. The polling interval can be changed with
`STREAM_STATUS_CHECK_INTERVAL_MS` (minimum 10 seconds).

Once a stream is offline, viewers cannot create new watch sessions or buy more
viewing time. A viewer can still use prepaid time in their existing session;
the watch page labels the ended stream and blocks further payments.

## Session rules

Valid watch time is based on verified playback events, not a simple client timer. Sessions pause when playback pauses, buffer events trigger measurement adjustments, and background tabs may be discounted according to the backend business rule.
