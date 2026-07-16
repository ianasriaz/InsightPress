const env = require('./env.json').StoreInsightsAgentFunction;
Object.assign(process.env, env);

const { handler } = require('./src/app.js');

console.log("Running local test...");

handler({}).then((response) => {
  console.log("Lambda Response:", response);
}).catch((error) => {
  console.error("Local test failed:", error);
});
