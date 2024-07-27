const { swapToken } = require("./wallet.js")
const Config = require("./config.json")

async function main() {
    const swapHistory = await swapToken(
        Config.wallet_secretKey, // Your wallet secret key
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // Target token address to buy or sell
        10, // Slippage
        0.0001, // Amount to buy or sell
        0.00001, // priorityFee
        true // true: sell "amount" of WSOL to buy target token, false: sell "amount" of target token to buy WSOL
    );
    console.log(swapHistory);
}

main();