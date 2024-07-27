const getMarketDataFromDex = async (tokenContract) => {
    rawMarketData = await (await fetch("https://api.dexscreener.com/latest/dex/tokens/" + tokenContract)).json()

    marketData= rawMarketData['pairs'];
    // console.log("https://api.dexscreener.com/latest/dex/tokens/" + tokenContract)
    if (marketData == null)
        return null
    for(let i = 0 ; i < marketData.length ; ++i ) {
        if(marketData[i]['dexId'] == 'raydium')
            return marketData[i];
    }

    return null;
}

const getTokenInformation = async (tokenList) => {
    const fetch_url = "https://api.dexscreener.com/latest/dex/tokens/" + tokenList.join(',')
    console.log(fetch_url)
    
    rawMarketData = await (await fetch(fetch_url)).json()
    return rawMarketData['pairs']
}

const getSolanaUsd = async () => {
    // var  response = await (await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")).json()
    var  response = await (await fetch("https://api.coincap.io/v2/assets/solana")).json()
    
    return response['data']['priceUsd']
}

module.exports = {
    getMarketDataFromDex,
    getTokenInformation,
    getSolanaUsd
}