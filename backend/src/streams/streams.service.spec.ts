import {
  generatePrivateKey,
  privateKeyToAccount,
  signMessage,
} from "viem/accounts";
import { StreamsService } from "./streams.service";

const creatorWallet = "0x1111111111111111111111111111111111111111";

describe("StreamsService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a stream with a valid rate and live status", () => {
    const service = new StreamsService();

    const stream = service.createStream({
      title: "Arc market briefing",
      creatorId: "creator_123",
      creatorWallet,
      category: "Finance",
      ratePerMinute: 0.02,
      status: "live",
    });

    expect(stream.id).toBeTruthy();
    expect(stream.ratePerMinute).toBe(0.02);
    expect(stream.status).toBe("live");
  });

  it("creates a watch session tied to the stream creator and cap", async () => {
    const service = new StreamsService();
    const stream = createTestStream(service);
    const session = await createAuthorizedSession(service, stream.id, "2");

    expect(session.sessionId).toBeTruthy();
    expect(session.maxCharge).toBe("2");
    expect(session.streamId).toBe(stream.id);
    expect(session.creatorWallet).toBe(creatorWallet);
    expect(session.ratePerMinute).toBe(0.02);
    expect(session.status).toBe("authorized");
    expect(session.accessToken).toBeTruthy();
  });

  it("derives usage from server time and excludes paused time", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    const service = new StreamsService();
    const stream = createTestStream(service);
    const session = await createAuthorizedSession(service, stream.id, "0.02");

    service.startSession(session.sessionId, session.accessToken);
    jest.advanceTimersByTime(15_000);
    const firstHeartbeat = service.heartbeatSession(
      session.sessionId,
      session.accessToken
    );
    expect(firstHeartbeat.billableMilliseconds).toBe(15_000);
    expect(firstHeartbeat.charge).toBe("0.005");

    jest.advanceTimersByTime(15_000);
    const paused = service.pauseSession(session.sessionId, session.accessToken);
    expect(paused.status).toBe("paused");
    expect(paused.billableMilliseconds).toBe(30_000);
    expect(paused.charge).toBe("0.01");

    jest.advanceTimersByTime(60_000);
    service.resumeSession(session.sessionId, session.accessToken);
    jest.advanceTimersByTime(30_000);
    const stopped = service.stopSession(session.sessionId, session.accessToken);

    expect(stopped.status).toBe("capped");
    expect(stopped.billableMilliseconds).toBe(60_000);
    expect(stopped.charge).toBe("0.02");
  });

  it("caps a missed heartbeat interval and never charges above authorization", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    const service = new StreamsService();
    const stream = createTestStream(service);
    const session = await createAuthorizedSession(service, stream.id, "0.01");

    service.startSession(session.sessionId, session.accessToken);
    jest.advanceTimersByTime(2 * 60_000);
    const metered = service.heartbeatSession(
      session.sessionId,
      session.accessToken
    );

    expect(metered.status).toBe("capped");
    expect(metered.billableMilliseconds).toBe(30_000);
    expect(metered.charge).toBe("0.01");
  });

  it("rejects invalid session tokens and duplicate starts", async () => {
    const service = new StreamsService();
    const stream = createTestStream(service);
    const session = await createAuthorizedSession(service, stream.id, "1");

    expect(() =>
      service.startSession(session.sessionId, "wrong-token")
    ).toThrow("Invalid watch session token");
    service.startSession(session.sessionId, session.accessToken);
    expect(
      service.startSession(session.sessionId, session.accessToken).status
    ).toBe("playing");
  });
});

function createTestStream(service: StreamsService) {
  return service.createStream({
    title: "Arc market briefing",
    creatorId: "creator_123",
    creatorWallet,
    category: "Finance",
    ratePerMinute: 0.02,
    status: "live",
  });
}

async function createAuthorizedSession(
  service: StreamsService,
  streamId: string,
  maxCharge: string
) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const issuedAt = new Date().toISOString();
  const authorizationMessage = service[
    "settlementService"
  ].buildAuthorizationMessage({
    streamId,
    viewerWallet: account.address,
    maxCharge,
    issuedAt,
  });
  const authorizationHash = await signMessage({
    privateKey,
    message: authorizationMessage,
  });

  return service.createSession({
    streamId,
    viewerWallet: account.address,
    maxCharge,
    authorizationHash,
    issuedAt,
  });
}
