const { PROVIDERS } = require("./types");

const TELEPHONY_PROVIDER = (
  process.env.TELEPHONY_PROVIDER || "exotel"
).toLowerCase();

const providerLoaders = {
  [PROVIDERS.EXOTEL]: () => require("./providers/exotel"),
  [PROVIDERS.TWILIO]: () => require("./providers/twilio"),
  [PROVIDERS.MYOPERATOR]: () => require("./providers/myoperator"),
  [PROVIDERS.PLIVO]: () => require("./providers/plivo"),
};

if (!providerLoaders[TELEPHONY_PROVIDER]) {
  throw new Error(
    `Unknown TELEPHONY_PROVIDER="${TELEPHONY_PROVIDER}". ` +
      `Valid values: ${Object.values(PROVIDERS).join(", ")}`,
  );
}

const provider = providerLoaders[TELEPHONY_PROVIDER]();

module.exports = provider;
