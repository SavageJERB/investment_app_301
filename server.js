'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pg = require('pg')
const superagent = require('superagent');
const morgan = require('morgan');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3001;

const client = new pg.Client(process.env.DATABASE_URL);
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }))
app.use(express.static('./public'));
app.set('view engine', 'ejs');

//----------Routes
app.get('/', connectionTest);
app.get('/searches', getStockData)//----we need an app.post
app.get('/searches_green', getGreenData)
app.get('/searches_housing', getHousingData)
app.get('/sentiment', getSentimentData)
app.get('/sqlone', insertStocks)

//-----Error Routes
app.use('*', routeNotFound);
app.use(bigError);
//----------Connection Test Function
function connectionTest(req, res){
  res.status(200).render('pages/home')
}
let articlesArray = [];
//----------Search API
function getSentimentData(req, res){
  fetch("https://microsoft-text-analytics1.p.rapidapi.com/sentiment", {
    "method": "POST",
    "headers": {
      "x-rapidapi-host": "microsoft-text-analytics1.p.rapidapi.com",
      "x-rapidapi-key": `${process.env.RAPID_API_KEY}`,
      "content-type": "application/json",
      "accept": "application/json"
    },
    "body": JSON.stringify({
      "documents": [
        {
          "id": "1",
          "language": "en",
          "text": "Hello world. This is some input text that I love."
        },
        {
          "id": "2",
          "language": "en",
          "text": "It's incredibly sunny outside! I'm so happy."
        },
        {
          "id": "3",
          "language": "en",
          "text": "Pike place market is my favorite Seattle attraction."
        }
      ]
    })
  })
  .then(response => response.json())
  .then(json => res.send(json.documents[0].sentences[1].sentiment))
  .catch(err => {
    console.log(err);
  });
}
function getStockData(req, res){
  let API = 'https://financialmodelingprep.com/api/v3/profile/msft';
  let queryKey = {
    apikey: process.env.STOCK_API
  }
  superagent.get(API).query(queryKey)
  .then(data =>{
    // console.log(data.body);
    let details = data.body.map(object => new StockDetails(object));
    let allInfo = details[0];
    getHousingData(data.body)
    .then(housingData => {
      let priceArray = [];
      console.log('++++++++++++++++++++++', housingData.listings);
      housingData.listings.forEach(object=>{
        priceArray.push(object.price)
      })
      // let housingUpdate = details;
      allInfo.listings = priceArray
      // housingUpdate.listings = priceArray;
      // console.log('housingData: ',housingData.listings);
    });
    getGreenData(data.body)
    .then(greenData => {
      allInfo.greencheck = greenData.green
      console.log('$$$$$$$$$$$$$$$Second all info$$$$$$$', allInfo)
      // console.log('greenData: ',greenData.body)
    });
    getNewsData(data.body)
    .then(newsData => {
      newsData.articles.forEach(object=>{
        articlesArray.push(object.title) // creates an array of headline titles from news API
        allInfo.newsTitles = articlesArray.slice(0,5); //saves to overall object the first 5 news titles
      })
      let documents = [];
      for (let i = 0; i<articlesArray.length; i++){
       documents.push({id: i, language: "en", text: articlesArray[i]})
      }
      let output = {documents:documents} // creats object needed for Sentiment API
      getSentimentData(output)      
      .then(sentimentResults=>{
        let sentimentArray = []
        sentimentResults.documents.forEach(object=>{
            sentimentArray.push(object.sentiment)
        })
        let sentimentNumbersArray = sentimentArray.map(value=>{
          if (value === 'negative'){
            value = 0;
          }else if(value === 'neutral'){
            value = 1;
          }else if(value === 'positive'){
            value = 2;
          }
        })
        let sentimentSum = sentimentNumbersArray.reduce((previous,current) => current += previous);
        let sentimentAvgScore = sentimentSum / sentimentNumbersArray.length;
        allInfo.sentimentScore = sentimentAvgScore;
        console.log('*********allinfo*******', allInfo)
      })
      .then(response=> res.render('pages/results', {output: allInfo, title: 'Search Results', footer: 'Home'}))
    })
    // .then(getSentimentData(newsData.articles[0]))
  })
  // }).catch(error => res.render('pages/error'));
};
///////////////////////////////////
function getNewsData(data){
  let tickerSymbol = data[0].symbol;
  return fetch(`https://stock-google-news.p.rapidapi.com/v1/search?when=1d&lang=en&country=US&ticker=${tickerSymbol}`, {
	  "method": "GET",
	  "headers": {
		"x-rapidapi-host": "stock-google-news.p.rapidapi.com",
		"x-rapidapi-key": `${process.env.RAPID_API_KEY}`
	  }
  })
.then(response => response.json())
// .then(json => console.log(json));
};
function getGreenData(data){
  // let url = 'http://www.microsoft.com';
  let url = data[0].website;
  let newURL = url.replace('http://', '');
  // let newURL2 = url.replace("https://", "");
  // console.log('url :',newURL);
  let API = `http://api.thegreenwebfoundation.org/greencheck/${newURL}`
  return superagent.get(API)
};
function getHousingData(data){
    // console.log(data);
    let ZIP_CODE = data[0].zip;
    let RADIUS = 15;
    let SQFT = 1000;
    let MAX_AGE = 5;
    let RESULT_LIMIT = 5;
  return fetch(`https://realtor.p.rapidapi.com/properties/list-sold?age_max=${MAX_AGE}&postal_code=${ZIP_CODE}&radius=${RADIUS}&sort=relevance&sqft_min=${SQFT}&limit=${RESULT_LIMIT}`, {
    "method": "GET",
      "headers": {
        "x-rapidapi-host": "realtor.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPID_API_KEY
      }
    })
  .then(response => response.json())
  .catch(err => {
    console.log(err);
  });
}
// property_id, sqft_raw, price_raw

function getSentimentData(data){
  return fetch("https://microsoft-text-analytics1.p.rapidapi.com/sentiment", {
    "method": "POST",
    "headers": {
      "x-rapidapi-host": "microsoft-text-analytics1.p.rapidapi.com",
      "x-rapidapi-key": "a4c90cc7bamshb0b1ddff9e9141cp1a01c1jsn6fa1375e0872",
      "content-type": "application/json",
      "accept": "application/json"
    },
    "body": JSON.stringify(data)
  })
  .then(response => response.json())
  .catch(err => {
    console.log(err);
  });
}
app.get ('')
//----------Stock info Constructor
function StockDetails(data){
  this.symbol = typeof(data.symbol) !== 'undefined' ?  (data.symbol) : ""
  this.companyName = typeof(data.companyName) !== 'undefined' ? (data.companyName) : ""
  this.sector = typeof(data.sector) !== 'undefined' ? (data.sector) : ""
  this.state = typeof(data.state) !=='undefined' ? data.state : ""
  this.zip = typeof(data.zip) !=='undefined' ? data.zip : ""
  this.current_price = typeof(data.price) !=='undefined' ? data.price : ""
}


function stockAPI(req, res) {
  let API = 'https://financialmodelingprep.com/api/v3/profile/msft';
  let queryKey = {
    apikey: process.env.STOCK_API
  }

  // superagent
  // .get(API)
  // .query(queryKey)
  // .then(data =>{

// }
} 
console.log('stock info line 256: ', process.env.PORT);

function insertStocks(req, res) {
  
  let API = `https://financialmodelingprep.com/api/v3/quotes/nyse?apikey=${process.env.STOCK_API}`;
  
  superagent
  .get(API)
  .then(apiData => {
    let stockInfo = apiData[0];

    console.log('stock info line 256: ', apiData);
    const safeQuery = [stockInfo.name, stockInfo.ticker, stockInfo.dayHigh, stockInfo.dayLow, stockInfo.price];
    const SQL = `
      INSERT INTO stock_info (name, ticker, dayhigh, daylow, price) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;`;
      client
      .query(SQL, safeQuery)
      // .then(results => {
      //   let dataBaseStock = results.rows;
      //   let show = '';
        
      //   res.render('pages/books/show', { data: dataBaseStock, pgName: 'Details Page', home: show, searchNew: show});
      // })
    })
    
    // .catch(error => handleError(error, res));
}


// function Headlines(data)
//----------404 Error
function routeNotFound(req, res) {
  res.status(404).send('Route NOT Be Found!');
}
//----------All Errors minus 404
function bigError(error, req, res, next) {
  console.log(error);
  res.status(error).send('BROKEN!');
}
//----------Listen on PORT
client.connect(() => {
  app.listen(PORT, () => console.log(`WORK WORK WORK WORK WORK!: ${PORT}.`));
})
