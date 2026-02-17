import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from "@allbridge/bridge-core-sdk";

async function main() {
  try {
    // Initialize SDK (you can override RPC URLs if needed)
    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      // Example overrides (optional)
      // ETH: "https://eth.llamarpc.com",
      // TRX: "https://api.trongrid.io"
    });

    console.log("🚀 Fetching supported chains...\n");

    // Get all supported chains
    const chains = await sdk.chainDetailsMap();

    // Iterate through chains
    for (const [chainSymbol, chainData] of Object.entries(chains)) {
      const { name, chainId, bridgeAddress, tokens } = chainData;

      console.log("====================================");
      console.log(`🌐 Chain: ${name} (${chainSymbol})`);
      console.log(`Chain ID: ${chainId}`);
      console.log(`Bridge Address: ${bridgeAddress}`);
      console.log(`Supported Tokens: ${tokens.length}`);
      console.log("------------------------------------");

      // Iterate tokens
      tokens.forEach((token, index) => {
        console.log(
          `${index + 1}. ${token.symbol} (${token.name})`
        );
        console.log(`   Address: ${token.address}`);
        console.log(`   Decimals: ${token.decimals}`);
        console.log(`   Native: ${token.isNative ? "Yes" : "No"}`);
      });

      console.log("\n");
    }

    console.log("✅ Done fetching all chains and tokens.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
