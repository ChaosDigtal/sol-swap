const { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, TransactionMessage, SystemProgram } = require('@solana/web3.js')
const {
    Liquidity,
    LiquidityPoolKeys,
    jsonInfo2PoolKeys,
    LiquidityPoolJsonInfo,
    LIQUIDITY_STATE_LAYOUT_V4,
    MARKET_STATE_LAYOUT_V3,
    TokenAccount,
    Token,
    TokenAmount,
    TOKEN_PROGRAM_ID,
    Percent,
    SPL_ACCOUNT_LAYOUT,
    SPL_MINT_LAYOUT,
    Market,
    LiquidityPoolStatus,
} = require('@raydium-io/raydium-sdk')
// const { Raydium, TxVersion, parseTokenAccountResp, PoolFetchType, WSOLMint } = require('@raydium-io/raydium-sdk-v2')
const { Wallet } = require('@coral-xyz/anchor')
const bs58 = require('bs58')
const Config = require('./config.json')
/**
 * Class representing a Raydium Swap operation.
 */
class RaydiumSwap {
    allPoolKeysJson
    connection
    wallet

    /**
   * Create a RaydiumSwap instance.
   * @param {string} RPC_URL - The RPC URL for connecting to the Solana blockchain.
   * @param {string} WALLET_PRIVATE_KEY - The private key of the wallet in base58 format.
   */
    constructor(RPC_URL, WALLET_PRIVATE_KEY) {
        this.connection = new Connection(RPC_URL
            , { commitment: 'confirmed', confirmTransactionInitialTimeout: 3000000 })
        this.wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(WALLET_PRIVATE_KEY))))
    }

    /**
    * Loads all the pool keys available from a JSON configuration file.
    * @async
    * @returns {Promise<void>}
    */
    async loadPoolKeys(liquidityFile) {
        // const liquidityJsonResp = await fetch(liquidityFile);
        // if (!liquidityJsonResp.ok) return
        // const liquidityJson = (await liquidityJsonResp.json()) as { official: any; unOfficial: any }
        // const allPoolKeysJson = [...(liquidityJson?.official ?? []), ...(liquidityJson?.unOfficial ?? [])]

        // this.allPoolKeysJson = allPoolKeysJson
    }

    /**
   * Finds pool information for the given token pair.
   * @param {string} mintA - The mint address of the first token.
   * @param {string} mintB - The mint address of the second token.
   * @returns {LiquidityPoolKeys | null} The liquidity pool keys if found, otherwise null.
   */
    async findPoolInfoForTokens(id) {

        const account = await this.connection.getAccountInfo(new PublicKey(id));
        if (account === null) throw Error(' get id info error ');
        //console.log(account);
        const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);

        const marketId = info.marketId;
        const marketAccount = await this.connection.getAccountInfo(marketId);
        if (marketAccount === null) throw Error(' get market info error');
        const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);

        const lpMint = info.lpMint;
        const lpMintAccount = await this.connection.getAccountInfo(lpMint);
        if (lpMintAccount === null) throw Error(' get lp mint info error');
        const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);

        return {
            id,
            baseMint: info.baseMint.toString(),
            quoteMint: info.quoteMint.toString(),
            lpMint: info.lpMint.toString(),
            baseDecimals: info.baseDecimal.toNumber(),
            quoteDecimals: info.quoteDecimal.toNumber(),
            lpDecimals: lpMintInfo.decimals,
            version: 4,
            programId: account.owner.toString(),
            authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString(),
            openOrders: info.openOrders.toString(),
            targetOrders: info.targetOrders.toString(),
            baseVault: info.baseVault.toString(),
            quoteVault: info.quoteVault.toString(),
            withdrawQueue: info.withdrawQueue.toString(),
            lpVault: info.lpVault.toString(),
            marketVersion: 3,
            marketProgramId: info.marketProgramId.toString(),
            marketId: info.marketId.toString(),
            marketAuthority: Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey.toString(),
            marketBaseVault: marketInfo.baseVault.toString(),
            marketQuoteVault: marketInfo.quoteVault.toString(),
            marketBids: marketInfo.bids.toString(),
            marketAsks: marketInfo.asks.toString(),
            marketEventQueue: marketInfo.eventQueue.toString(),
            lookupTableAccount: PublicKey.default.toString()
        }

        return jsonInfo2PoolKeys(poolKeys)
    }

    /**
   * Retrieves token accounts owned by the wallet.
   * @async
   * @returns {Promise<TokenAccount[]>} An array of token accounts.
   */
    async getOwnerTokenAccounts() {
        const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
            programId: TOKEN_PROGRAM_ID,
        })

        return walletTokenAccount.value.map((i) => ({
            pubkey: i.pubkey,
            programId: i.account.owner,
            accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
        }))
    }

    /**
   * Builds a swap transaction.
   * @async
   * @param {string} toToken - The mint address of the token to receive.
   * @param {number} amount - The amount of the token to swap.
   * @param {LiquidityPoolKeys} poolKeys - The liquidity pool keys.
   * @param {number} [maxLamports=100000] - The maximum lamports to use for transaction fees.
   * @param {boolean} [useVersionedTransaction=true] - Whether to use a versioned transaction.
   * @param {'in' | 'out'} [fixedSide='in'] - The fixed side of the swap ('in' or 'out').
   * @returns {Promise<Transaction | VersionedTransaction>} The constructed swap transaction.
   */
    async getSwapTransaction(
        toToken,
        // fromToken,
        amount,
        poolKeys,
        maxLamports = 100000,
        useVersionedTransaction = false,
        fixedSide = 'in',
        slippage,
        balance
    ) {
        const directionIn = poolKeys.quoteMint.toString() == toToken
        const { minAmountOut, amountIn, amountOut } = await this.calcAmountOut(poolKeys, amount, directionIn, slippage)

        // Check sufficiency of wallet balance 
        
        if (fixedSide == 'in' && (amount + maxLamports / (10 ** 9) + amount * 0.02) > balance) {
            return {
                tx : 'insufficient'
            }
        }

        const userTokenAccounts = await this.getOwnerTokenAccounts()
        const swapTransaction = await Liquidity.makeSwapInstructionSimple({
            connection: this.connection,
            makeTxVersion: useVersionedTransaction ? 0 : 1,
            poolKeys: {
                ...poolKeys,
            },
            userKeys: {
                tokenAccounts: userTokenAccounts,
                owner: this.wallet.publicKey,
            },
            amountIn: amountIn,
            amountOut: amountOut,
            fixedSide: fixedSide,
            // config: {
            //     bypassAssociatedCheck: false,
            // },
            computeBudgetConfig: {
                // units:60000,
                microLamports: maxLamports,
            },
        })

        // console.log(swapTransaction.getEstimateFee)

        const recentBlockhashForSwap = await this.connection.getLatestBlockhash()
        const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)

        const platformFee = (fixedSide == 'in') ? parseFloat(amountIn.toFixed() * parseInt(Config.fee) * (10 ** 7)) : parseInt(amountOut.toFixed() * parseInt(Config.fee) * (10 ** 7))
        //console.log(amountIn.toFixed(), Config.fee, platformFee)

        var systemInstruction = SystemProgram.transfer({
            fromPubkey: this.wallet.publicKey,
            toPubkey: new PublicKey(Config.wallet),
            lamports: platformFee,
        })
        instructions.push(systemInstruction)

        if (useVersionedTransaction) {
            const versionedTransaction = new VersionedTransaction(
                new TransactionMessage({
                    payerKey: this.wallet.publicKey,
                    recentBlockhash: recentBlockhashForSwap.blockhash,
                    instructions: instructions,
                }).compileToV0Message()
            )
            versionedTransaction.sign([this.wallet.payer])
            
            return {
                tx : versionedTransaction,
                amountIn : amountIn,
                amountOut : amountOut,
                fee : platformFee / (10 ** 9)
            }
        }

        const legacyTransaction = new Transaction({
            blockhash: recentBlockhashForSwap.blockhash,
            lastValidBlockHeight: recentBlockhashForSwap.lastValidBlockHeight,
            feePayer: this.wallet.publicKey,
        })

        legacyTransaction.add(...instructions)

        return legacyTransaction
    }

    /**
   * Sends a legacy transaction.
   * @async
   * @param {Transaction} tx - The transaction to send.
   * @returns {Promise<string>} The transaction ID.
   */
    async sendLegacyTransaction(tx, maxRetries) {
        const txid = await this.connection.sendTransaction(tx, [this.wallet.payer], {
            skipPreflight: true,
            maxRetries: maxRetries,
        })

        return txid
    }

    /**
   * Sends a versioned transaction.
   * @async
   * @param {VersionedTransaction} tx - The versioned transaction to send.
   * @returns {Promise<string>} The transaction ID.
   */
    async sendVersionedTransaction(tx, maxRetries) {
        const txid = await this.connection.sendTransaction(tx, {
            skipPreflight: true,
            maxRetries: maxRetries,
        })
        // this.connection.onSignature(txid);
        // const result = await this.connection.getSignatureStatus(txid, {
        //     searchTransactionHistory: true,
        // });
        // console.log(result)

        // setTimeout(async () => {

        //     const result = await this.connection.getSignatureStatus(txid, {
        //         searchTransactionHistory: true,
        //     });
        //     console.log(result)
        // }, 15000)

        return txid
    }

    /**
      * Simulates a versioned transaction.
      * @async
      * @param {VersionedTransaction} tx - The versioned transaction to simulate.
      * @returns {Promise<any>} The simulation result.
      */
    async simulateLegacyTransaction(tx) {
        const txid = await this.connection.simulateTransaction(tx, [this.wallet.payer])

        return txid
    }

    /**
   * Simulates a versioned transaction.
   * @async
   * @param {VersionedTransaction} tx - The versioned transaction to simulate.
   * @returns {Promise<any>} The simulation result.
   */
    async simulateVersionedTransaction(tx) {
        const txid = await this.connection.simulateTransaction(tx)

        return txid
    }

    /**
   * Gets a token account by owner and mint address.
   * @param {PublicKey} mint - The mint address of the token.
   * @returns {TokenAccount} The token account.
   */
    getTokenAccountByOwnerAndMint(mint) {
        return {
            programId: TOKEN_PROGRAM_ID,
            pubkey: PublicKey.default,
            accountInfo: {
                mint: mint,
                amount: 0,
            },
        }
    }

    /**
   * Calculates the amount out for a swap.
   * @async
   * @param {LiquidityPoolKeys} poolKeys - The liquidity pool keys.
   * @param {number} rawAmountIn - The raw amount of the input token.
   * @param {boolean} swapInDirection - The direction of the swap (true for in, false for out).
   * @returns {Promise<Object>} The swap calculation result.
   */
    async calcAmountOut(poolKeys, rawAmountIn, swapInDirection, slippageParam) {
        const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys })

        let currencyInMint = poolKeys.baseMint
        let currencyInDecimals = poolInfo.baseDecimals
        let currencyOutMint = poolKeys.quoteMint
        let currencyOutDecimals = poolInfo.quoteDecimals

        if (!swapInDirection) {
            currencyInMint = poolKeys.quoteMint
            currencyInDecimals = poolInfo.quoteDecimals
            currencyOutMint = poolKeys.baseMint
            currencyOutDecimals = poolInfo.baseDecimals
        }

        const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
        const amountIn = new TokenAmount(currencyIn, rawAmountIn, false)
        const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
        const slippage = new Percent(parseInt(slippageParam * 100), 100) 

        const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
            poolKeys,
            poolInfo,
            amountIn,
            currencyOut,
            slippage,
        })

        return {
            amountIn,
            amountOut,
            minAmountOut,
            currentPrice,
            executionPrice,
            priceImpact,
            fee,
        }
    }
}

module.exports = { RaydiumSwap }
