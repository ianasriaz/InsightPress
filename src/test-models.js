const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const env = require('../env.json').StoreInsightsAgentFunction;
Object.assign(process.env, env);

// Test us-west-2 Region
const client = new BedrockRuntimeClient({ region: "us-west-2" });

async function testModel() {
  const modelId = "amazon.nova-lite-v1:0";
  console.log(`\nTesting ${modelId} in us-west-2...`);
  try {
    const input = {
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: "Hello" }] }],
        system: [{ text: "You are a helpful retail AI assistant." }],
        inferenceConfig: { max_new_tokens: 50, temperature: 0.7 }
      })
    };
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    console.log(`✅ Success with ${modelId}!`);
  } catch (error) {
    console.log(`❌ Failed with ${modelId}: ${error.name} - ${error.message}`);
  }
}

testModel();
