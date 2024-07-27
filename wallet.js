const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, TransactionMessage, SystemProgram, sendAndConfirmTransaction, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const { RaydiumSwap } = require('./RaydiumSwap');
const { Wallet } = require('@project-serum/anchor')
const { WSOL } = require('@raydium-io/raydium-sdk')
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { token } = require('@coral-xyz/anchor/dist/cjs/utils');
const Config = require('./config.json');
const { jsonInfo2PoolKeys } = require('@raydium-io/raydium-sdk-v2');
const Service = require('./service.js')

const createWallet = () => {
    const keyPair = Keypair.generate();

    return keyPair;
}

const getBalance = async (publicKey) => {
    const connection = new Connection(Config.RPC_NODE);
    const pubKey = new PublicKey(publicKey);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
}

const importWallet = (privateKeyString) => {
    try {
        // parsedJson = JSON.parse(privateKeyString)
        var privateKey = bs58.decode(privateKeyString);
        const keyPair = Keypair.fromSecretKey(privateKey);
        return keyPair
    } catch (e) {
        return 'error'
    }
}

// const JupiterSwap = async (secretKey, contractAddr, amount, decimals, slippage, isBuy, updateTransactionInterface, query) => {

//     // It is recommended that you use your own RPC endpoint.
//     // This RPC endpoint is only for demonstration purposes so that this example will run.
//     const connection = new Connection(process.env.RPC_NODE);

//     const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(secretKey))));

//     const inputMint = isBuy ? 'So11111111111111111111111111111111111111112' : contractAddr
//     const outputMint = !isBuy ? 'So11111111111111111111111111111111111111112' : contractAddr
//     // Swapping SOL to USDC with input 0.1 SOL and 0.5% slippage
//     const quoteResponse = await (
//         await fetch('https://quote-api.jup.ag/v6/quote?inputMint=' + inputMint + '\
// &outputMint='+ outputMint + '\
// &amount='+ parseInt(amount * Math.pow(10, decimals)) + '\
// &slippageBps='+ slippage + ''
//         )
//     ).json();
//     const balance = await getBalance(wallet.publicKey.toString())
//     const minimumRent = await connection.getMinimumBalanceForRentExemption(100/* account data size */);
//     // console.log(`Minimum Rent: ${minimumRent} lamports`);
//     // return
//     const exchangeAmount = parseInt(quoteResponse[isBuy ? 'inAmount' : 'outAmount'])
//     const priorityLamport = isBuy ? 500000 : 100000
//     const platformFeeWithGas = exchangeAmount * (parseInt(Config.fee) + 1) / 100
//     const platformFee = exchangeAmount * (parseInt(Config.fee)) / 100

//     if (isBuy && exchangeAmount + priorityLamport + platformFeeWithGas > parseInt(balance * (10 ** 9))) {
//         await updateTransactionInterface(query, { info: 'insufficient' })
//         return
//     }

//     console.log({ quoteResponse })

//     // get serialized transactions for the swap
//     const { swapTransaction } = await (
//         await fetch('https://quote-api.jup.ag/v6/swap', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify({
//                 // quoteResponse from /quote api
//                 quoteResponse,
//                 // user public key to be used for the swap
//                 userPublicKey: wallet.publicKey.toString(),
//                 // auto wrap and unwrap SOL. default is true
//                 wrapAndUnwrapSol: true,
//                 dynamicComputeUnitLimit: true,
//                 prioritizationFeeLamports: priorityLamport
//                 // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
//                 // feeAccount: "fee_account_public_key"
//             })
//         }).catch((e) => {
//             console.log(e)
//         })
//     ).json();

//     const swapTransactionFromJupiterAPI = swapTransaction
//     const swapTransactionBuf = Buffer.from(swapTransactionFromJupiterAPI, 'base64')
//     var transaction = VersionedTransaction.deserialize(swapTransactionBuf)

//     var systemInstruction = SystemProgram.transfer({
//         fromPubkey: wallet.publicKey,
//         toPubkey: new PublicKey(Config.wallet),
//         lamports: parseInt(platformFee),
//     })

//     // sign the transaction
//     transaction.sign([wallet.payer]);

//     await updateTransactionInterface(query, { info: 'sent' })

//     const txid = await connection.sendTransaction(transaction, {
//         skipPreflight: true,
//         maxRetries: 2
//     });
//     // connection.onSignature(txid, async (updatedTxInfo, context) => {
//     //     console.log(updatedTxInfo)
//     //     console.log(context)
//     // });

//     try {
//         const confirmation = await connection.confirmTransaction(txid, 'confirmed');
//         const error = confirmation['value']['err']
//         if (error == null) {
//             await updateTransactionInterface(query, { info: 'success', detail: txid })
//             const signature = await sendAndConfirmTransaction(
//                 connection,
//                 systemInstruction,
//                 [wallet.payer],
//             );
//             console.log(signature)
//         }

//         else
//             await updateTransactionInterface(query, { info: 'fail', detail: error })
//         console.log('Transaction Confirmed:', confirmation);
//     } catch (error) {
//         // await updateTransactionInterface(query, { info: 'fail', detail: error })
//         console.error('Transaction failed:', error);
//     }

//     console.log(`https://solscan.io/tx/${txid}`);
//     return txid
// }

// const buyToken = async (secretKey, targetPool, poolId, amount, onFinishedTransaction) => {
//     try {
//         return swapToken(secretKey, targetPool, poolId, amount, true, onFinishedTransaction)
//     } catch (e) {
//         return e
//     }
// }

// const sellToken = async (secretKey, targetPool, poolId, amount, onFinishedTransaction) => {
//     try {
//         return swapToken(secretKey, targetPool, poolId, amount, false, onFinishedTransaction)
//     } catch (e) {
//         return e
//     }
// }

const swapToken = async (secretKey, targetToken, slippage, amount, priorityFee, isBuy) => {
    /**
   * The RaydiumSwap instance for handling swaps.
   */
    const marketData = await Service.getMarketDataFromDex(targetToken);
    const poolId = marketData['pairAddress'];

    const raydiumSwap = new RaydiumSwap(Config.RPC_NODE, secretKey);
    const balance = await getBalance(raydiumSwap.wallet.publicKey)

    let srcToken = isBuy ? WSOL.mint : targetToken
    let destToken = !isBuy ? WSOL.mint : targetToken

    // console.log(`Raydium swap initialized`);
    // console.log(`Swapping ${amount} of ${srcToken} for ${destToken}...`)

    /**
     * Find pool information for the given token pair.
     */
    const poolInfo = await raydiumSwap.findPoolInfoForTokens(poolId);
    if (!poolInfo) {
        // console.error('Pool info not found');
        return 'Pool info not found';
    } else {
        // console.log('Found pool info');
    }

    const poolKeys = jsonInfo2PoolKeys(poolInfo)
    /**
     * Prepare the swap transaction with the given parameters.
     */
    const transaction = await raydiumSwap.getSwapTransaction(
        destToken,
        amount,
        poolKeys,
        // swapConfig.maxLamports,
        isBuy ? parseInt(priorityFee * (10 ** 9)) : 1000000,
        // swapConfig.useVersionedTransaction,
        true,
        // swapConfig.direction
        isBuy ? 'in' : 'out',
        slippage,
        balance
    );
    const tx = transaction['tx']
    const amountIn = transaction['amountIn']
    const amountOut = transaction['amountOut']
    const fee = transaction['fee']

    if (tx == 'insufficient') {
        console.log("Insufficient");
        return
    }

    const txid = await raydiumSwap.sendVersionedTransaction(tx, 20)

    const solUSD = parseFloat(await Service.getSolanaUsd())
    const tokenData = await Service.getMarketDataFromDex(targetToken)
    const entryPrice = tokenData['priceUsd']
    const entryMarketCap = tokenData['fdv']
    var swapHistory = {
        "from": isBuy ? WSOL.mint : targetToken,
        "to": !isBuy ? WSOL.mint : targetToken,
        "amountIn": amountIn.toFixed(),
        "amountOut": amountOut.toFixed(),
        "platform_fee": fee,
        "platformFeeUsd" : fee * solUSD, 
        "direction" : isBuy,
        'entryPrice' : entryPrice,
        'entryMarketCap' : entryMarketCap,
        "txUsd" : (isBuy ? amountIn.toFixed() : amountOut.toFixed()) * solUSD,
        "transaction_id": txid
    }
    console.log(`https://solscan.io/tx/${txid}`);
    console.log("Waiting for tx confirmed....");
    try {
        const confirmation = await raydiumSwap.connection.confirmTransaction(txid, 'confirmed');
        const error = confirmation['value']['err']
        if (error == null) {
            swapHistory['result'] = 'success'
        }

        else {
            swapHistory['result'] = 'failed'
            swapHistory['note'] = error
        }
        console.log('Transaction Confirmed:', confirmation);
    } catch (error) {
        console.error('Transaction failed:', error);
    }

    return swapHistory;
}

const getTokenAccount = async (wallet) => {
    const solanaConnection = new Connection(Config.RPC_NODE);
    const filters = [
        {
            dataSize: 165,    //size of account (bytes)
        },
        {
            memcmp: {
                offset: 32,     //location of our query in the account (bytes)
                bytes: wallet,  //our search criteria, a base58 encoded string
            },
        }];
    const accounts = await solanaConnection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID, //new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        { filters: filters }
    );
    return accounts
}

const getTokenBallance = async (wallet, tokenAddress) => {
    const solanaConnection = new Connection(Config.RPC_NODE);
    const filters = [
        {
            dataSize: 165,    //size of account (bytes)
        },
        {
            memcmp: {
                offset: 32,     //location of our query in the account (bytes)
                bytes: wallet,  //our search criteria, a base58 encoded string
            },
        }];
    const tokenList = await solanaConnection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID, //new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        { filters: filters }
    );
    var balance = -1
    for (var i = 0; i < tokenList.length; ++i) {
        var token = tokenList[i]
        const tokenData = token['account']['data']['parsed']['info']
        if (tokenData['mint'] == tokenAddress) {
            balance = (tokenData['tokenAmount']['amount']) / Math.pow(10, tokenData['tokenAmount']['decimals'])
            break
        }
    }

    return balance
}

module.exports = {
    createWallet,
    getBalance,
    importWallet,
    getTokenAccount,
    //JupiterSwap,
    getTokenBallance,
    swapToken
}