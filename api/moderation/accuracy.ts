import { negotiateVersion } from "../../src/lib/api/versionGuard";
import { withVersion } from "../../src/lib/api/payloadVersion";
import { apiError, ErrorCode } from "../../src/lib/api/errorCodes";
import {
  ACCURACY_SAMPLE_DEFAULT_SEED,
  getAccuracyEligibleItems,
  selectAccuracyReviewSample,
  verifyModeratorAuth,
  type AccuracySampleActionFilter,
} from "./data";

function isAccuracyAction(value: unknown): value is AccuracySampleActionFilter {
  return value === "takedown" || value === "dismiss" || value === "all";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const version = negotiateVersion(req, res);
  if (!version) return;

  const moderatorAddress = (req.query.moderatorAddress as string) ?? "";
  const moderatorTimestamp = req.query.moderatorTimestamp
    ? parseInt(req.query.moderatorTimestamp as string, 10)
    : undefined;
  const moderatorSignature = (req.query.moderatorSignature as string) ?? undefined;

  if (!moderatorAddress) {
    res.status(401).json({ apiVersion: version, error: "Moderator address is required" });
    return;
  }

  const auth = verifyModeratorAuth({
    address: moderatorAddress,
    timestamp: moderatorTimestamp,
    signature: moderatorSignature,
    purpose: "moderation-accuracy",
  });
  if (!auth.ok) {
    res.status(auth.status).json({ apiVersion: version, error: auth.error });
    return;
  }

  const rawSampleSize = parseInt(req.query.sampleSize as string, 10);
  const sampleSize = Number.isNaN(rawSampleSize) ? 10 : rawSampleSize;
  if (sampleSize < 1 || sampleSize > 50) {
    res.status(400).json({ apiVersion: version, error: "sampleSize must be between 1 and 50" });
    return;
  }

  const rawAction = req.query.action as string | undefined;
  const action: AccuracySampleActionFilter = rawAction ?? "all";
  if (!isAccuracyAction(action)) {
    res.status(400).json({ apiVersion: version, error: "action must be takedown, dismiss, or all" });
    return;
  }

  const seed = (req.query.seed as string) || ACCURACY_SAMPLE_DEFAULT_SEED;
  const since = req.query.since ? parseInt(req.query.since as string, 10) : undefined;

  try {
    const eligible = getAccuracyEligibleItems({ action, since });
    const sample = selectAccuracyReviewSample(eligible, sampleSize, seed);

    // accuracySummary is intentionally omitted: reports and logs carry no
    // audited/appealed outcome field, so any percentage would be fictional.
    // It should only be added once an explicit review outcome exists.
    res.status(200).json(
      withVersion(
        {
          sample,
          meta: {
            sampleSize,
            seed,
            totalEligible: eligible.length,
            generatedAt: Date.now(),
          },
        },
        version,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build accuracy sample";
    console.error("Moderation accuracy error:", message);
    res.status(500).json(apiError(ErrorCode.TEMPORARY_FAILURE, message, undefined, version));
  }
}
