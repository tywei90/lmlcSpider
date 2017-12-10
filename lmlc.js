let superagent = require('superagent-charset'),
    fs = require('fs'),
    events = require("events"),
    emitter = new events.EventEmitter(),
    cheerio = require("cheerio"),
    async = require("async"),
    sort = require('./sortArr.js');
    colors = require('colors');

// node后台log颜色设置
colors.setTheme({
    silly: 'rainbow',
    prompt: 'grey',
    info: 'green',
    help: 'cyan',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
});

//日期格式化，格式化后:2016-03-09 11:20:12
Date.prototype.format = function(format) {
    var o = {
        "M+": this.getMonth() + 1, //month 
        "d+": this.getDate(), //day 
        "h+": this.getHours(), //hour 
        "m+": this.getMinutes(), //minute 
        "s+": this.getSeconds(), //second 
        "q+": Math.floor((this.getMonth() + 3) / 3), //quarter 
        "S": this.getMilliseconds() //millisecond 
    }
    if (/(y+)/.test(format)) format = format.replace(RegExp.$1,
        (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(format))
            format = format.replace(RegExp.$1,
                RegExp.$1.length == 1 ? o[k] :
                ("00" + o[k]).substr(("" + o[k]).length));
    return format;
}

if(!fs.existsSync('./data')){
    fs.mkdirSync('./data/');
}

// 定时器，每天00:05分的时候写入当天的数据
let initialTime = +new Date();
let globalTimer = setInterval(function(){
    let nowTime = +new Date();
    let nowStr = (new Date()).format("hh:mm:ss");
    let max = nowTime - 5*60*1000;
    let min = nowTime - 5*60*1000 - 24*60*60*1000;
    if(nowStr === "00:05:00" && (nowTime - initialTime >= 5*60*1000 + 24*60*60*1000)){
        let prod = JSON.parse(fs.readFileSync('./data/prod.json', 'utf-8'));
        let user = JSON.parse(fs.readFileSync('./data/user.json', 'utf-8'));
        let lmlc = JSON.parse(JSON.stringify(prod));
        // 筛选prod数据
        for(let i=0, len=prod.length; i<len; i++){
            // 筛选amounts属性数据
            let delArr1 = [];
            let delArr2 = [];
            for(let j=0, len2=prod[i].amounts.length; j<len2; j++){
                if(prod[i].amounts[j].getDataTime < min || prod[i].amounts[j].getDataTime >= max){
                    delArr1.push(j);
                }
                if(prod[i].amounts[j].getDataTime < max){
                    delArr2.push(j);
                }
            }
            sort.delArrByIndex(lmlc[i].amounts, delArr1);
            sort.delArrByIndex(prod[i].amounts, delArr2);
            // 筛选records属性数据
            let delArr3 = [];
            let delArr4 = [];
            for(let j=0, len2=prod[i].records.length; j<len2; j++){
                if(prod[i].records[j].buyTime < min || prod[i].records[j].buyTime >= max){
                    delArr3.push(j);
                }
                if(prod[i].records[j].buyTime < max){
                    delArr4.push(j);
                }
            }
            sort.delArrByIndex(lmlc[i].records, delArr3);
            sort.delArrByIndex(prod[i].records, delArr4);
        }
        // 初始化lmlc里的立马金库数据
        lmlc.unshift({
            "productName": "立马金库",
            "productId": "jsfund",
            "productType": 6,
            "records": []
        });
        let delArr = [];
        // 筛选user数据
        for(let i=0, len=user.length; i<len; i++){
            if(user[i].productId === "jsfund" && user[i].buyTime >= min && user[i].buyTime < max){
                lmlc[0].records.push({
                    "username": user[i].username,
                    "buyTime": user[i].buyTime,
                    "buyAmount": user[i].payAmount,
                });
            }
            if(user[i].buyTime < max){
                delArr.push(i);
            }
        }
        sort.delArrByIndex(user, delArr);
        // 删除无用属性，按照时间排序
        lmlc[0].records.sort(function(a,b){return a.buyTime - b.buyTime});
        for(let i=1, len=lmlc.length; i<len; i++){
            lmlc[i].amounts.sort(function(a,b){return a.getDataTime - b.getDataTime});
            lmlc[i].records.sort(function(a,b){return a.buyTime - b.buyTime});
            for(let j=0, len2=lmlc[i].records.length; j<len2; j++){
                delete lmlc[i].records[j].uniqueId
            }
        }
        // 写入前一天的数据，更新user.json和prod.json
        let dateStr = (new Date(nowTime - 10*60*1000)).format("yyyyMMdd");
        fs.writeFileSync(`./data/${dateStr}.json`, JSON.stringify(lmlc));
        fs.writeFileSync('./data/prod.json', JSON.stringify(prod));
        fs.writeFileSync('./data/user.json', JSON.stringify(user));
    }
}, 1000);

// 理财list页面ajax爬取已经对应的产品详情页爬取，生成文件: ./data/prod.json
let cookie;
let counter = 0;
let total = 0; // 爬取的次数，为0则一直爬取
let delay = 5*1000;
// 防止产品多产生分页需要多次请求获取数据，可以直接设置pageSize为100，这样多页几乎不会出现
let ajaxUrl = 'https://www.lmlc.com/web/product/product_list?pageSize=100&pageNo=1&type=0';
let phone = process.argv[2];
let password = process.argv[3];
if (!phone || !password) {
    console.log('参数错误，需要传递登陆信息'.error);
    clearInterval(globalTimer);
    return
}

if(!fs.existsSync('./data/prod.json') || !fs.readFileSync('./data/prod.json', 'utf-8')){
    fs.writeFileSync('./data/prod.json', JSON.stringify([]));
}

getCookie();
emitter.on("setCookeie", requestData) //监听getCookie事件


function getCookie() {
    superagent.post('https://www.lmlc.com/user/s/web/logon')
        .type('form')
        .send({
            phone: phone,
            password: password,
            productCode: "LMLC",
            origin: "PC"
        })
        .end(function(err, res) {
            if (err) {
                let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
                console.log(err.message.error);
                fs.appendFileSync('debug.txt', `\n\n${err.message.error}, 发生于：${time}`);
                return;
            }
            cookie = res.header['set-cookie']; //从response中得到cookie
            emitter.emit("setCookeie");
        })
}


let timer = setInterval(function() {
    requestData();
}, delay);


function formatData(data){
    let outArr = [];
    for(let i=0, len=data.length; i<len; i++){
        let obj = {};
        obj.productName = data[i].name;
        obj.financeTotalAmount = data[i].financeTotalAmount;
        obj.productId = data[i].id;
        obj.yearReturnRate = data[i].yearReturnRate;
        obj.investementDays = data[i].investementDays;
        obj.interestStartTime = (new Date(data[i].interestStartTime)).format("yyyy-MM-dd hh:mm:ss");
        obj.interestEndTime = (new Date(data[i].interestEndTime)).format("yyyy-MM-dd hh:mm:ss");
        obj.amounts = [{
            getDataTime: +new Date(),
            alreadyBuyAmount: data[i].alreadyBuyAmount
        }];
        obj.records = [];
        outArr.push(obj);
    }
    return outArr
}

function requestData() {
    counter++;
    if(total && counter == total){
        clearInterval(timer);
    }
    superagent.get(ajaxUrl)
    .end(function(err,pres){
        // 常规的错误处理
        if (err) {
            let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
            console.log(err.message.error);
            fs.appendFileSync('debug.txt', `\n\n${err.message.error}, 发生于：${time}`);
            return;
        }
        let addData = JSON.parse(pres.text).data;
        let pageUrls = [];
        if(addData.totalPage > 1){
            let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
            console.log('产品个数超过100个！'.error);
            fs.appendFileSync('debug.txt', '\n\n产品个数超过100个！发生于：' + time);
        }
        let formatedAddData = formatData(addData.result);
        for(let i=0,len=formatedAddData.length; i<len; i++){
            pageUrls.push('https://www.lmlc.com/web/product/product_detail.html?id=' + formatedAddData[i].productId);
        }
        // 处理售卖金额信息
        let oldData = JSON.parse(fs.readFileSync('./data/prod.json', 'utf-8'));
        for(let i=0, len=formatedAddData.length; i<len; i++){
            let isNewProduct = true;
            for(let j=0, len2=oldData.length; j<len2; j++){
                if(formatedAddData[i].productId === oldData[j].productId){
                    isNewProduct = false;
                    let lenx = oldData[j].amounts.length;
                    if(!lenx || formatedAddData[i].amounts[0].alreadyBuyAmount !== oldData[j].amounts[lenx-1].alreadyBuyAmount){
                        oldData[j].amounts.push(formatedAddData[i].amounts[0]);
                    }
                }
            }
            if(isNewProduct){
                oldData.push(formatedAddData[i]);
            }
        }
        fs.writeFile('./data/prod.json', JSON.stringify(oldData), (err) => {
            if (err) throw err;
            let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
            console.log((`第${counter}次爬取理财列表ajax接口完毕，时间：${time}`).warn);
            var reptileLink = function(url,callback){
                // 如果爬取页面有限制爬取次数，这里可设置延迟
                console.log( '正在抓取产品详情页面：' + url);
                superagent
                    .get(url)
                    .set('Cookie', cookie)
                    .end(function(err,pres){
                        // 常规的错误处理
                        let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
                        if (err) {
                            let errMsg = '';
                            if (err.message === 'Found') {
                                errMsg = '登陆信息错误';
                                clearInterval(timer);
                            }else if(err.message === 'ENOTFOUND'){
                                errMsg = '网络连接错误，尝试重新请求...';
                            } else {
                                errMsg = err.message;
                            }
                            console.log(errMsg.error);
                            fs.appendFileSync('debug.txt', `\n\n${errMsg} 发生于：${time}`);
                            return;
                        }
                        var $ = cheerio.load(pres.text);
                        if ($('.m-login').length) {
                            console.log('登陆cookie已失效，尝试重新登陆...'.error);
                            fs.appendFileSync('debug.txt', `\n\n登陆cookie已失效，尝试重新登陆... 发生于：${time}`);
                            getCookie();
                            return;
                        }
                        var $ = cheerio.load(pres.text);
                        var records = [];
                        var $tr = $('.tabcontent').eq(2).find('tr').slice(1);
                        $tr.each(function(){
                            records.push({
                                username: $('td', $(this)).eq(0).text(),
                                buyTime: Date.parse($('td', $(this)).eq(1).text()),
                                buyAmount: parseFloat($('td', $(this)).eq(2).text().replace(/,/g, '')),
                                uniqueId: $('td', $(this)).eq(0).text() + $('td', $(this)).eq(1).text() + $('td', $(this)).eq(2).text()
                            })
                        });
                        callback(null, {
                            productId: url.split('?id=')[1],
                            records: records
                        });
                    });
            };
            async.mapLimit(pageUrls, 10 ,function (url, callback) {
              reptileLink(url, callback);
            }, function (err,result) {
                let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
                console.log(`第${counter}次抓取的所有产品详情页完毕，时间：${time}`.info);
                let oldRecord = JSON.parse(fs.readFileSync('./data/prod.json', 'utf-8'));
                for(let i=0,len=result.length; i<len; i++){
                    for(let j=0,len2=oldRecord.length; j<len2; j++){
                        if(result[i].productId === oldRecord[j].productId){
                            for(let k=0,len3=result[i].records.length; k<len3; k++){
                                let isNewRec = true;
                                for(let m=0,len4=oldRecord[j].records.length; m<len4; m++){
                                    if(result[i].records[k].uniqueId === oldRecord[j].records[m].uniqueId){
                                        isNewRec = false;
                                    }
                                }
                                if(isNewRec){
                                    oldRecord[j].records.push(result[i].records[k]);
                                }
                            }
                        }
                    }
                }
                fs.writeFileSync('./data/prod.json', JSON.stringify(oldRecord));
            })
        });
    });
}


// 首页用户购买情况ajax接口爬取，生成文件: ./data/user.json
let counter1 = 0;
let total1 = 0; // 爬取的次数，为0则一直爬取
let delay1 = 150*1000; // 后台数据三分钟更新一次，所以这中间如果购买人超过10个的话，会漏掉这部分数据
let ajaxUrl1 = 'https://www.lmlc.com/s/web/home/user_buying';

if(!fs.existsSync('./data/user.json')){
    fs.writeFileSync('./data/user.json', '');
}

let timer1 = setInterval(function() {
    requestData1();
}, delay1);

requestData1();

function formatData1(data){
    for(let i=0, len=data.length; i<len; i++){
        delete data[i].userPic;
        data[i].buyTime = +new Date() - data[i].time;
        data[i].uniqueId = data[i].payAmount.toString() + data[i].productId + data[i].username;
    }
    return data
}

function requestData1() {
    counter1++;
    if(total1 && counter1 == total1){
        clearInterval(timer1);
    }
    superagent.get(ajaxUrl1)
    .end(function(err,pres){
        // 常规的错误处理
        if (err) {
            let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
            console.log(err.message.error);
            fs.appendFileSync('debug.txt', `\n\n${err.message.error}, 发生于：${time}`);
            return;
        }
        let newData = JSON.parse(pres.text).data;
        let formatNewData = formatData1(newData);
        let data = fs.readFileSync('./data/user.json', 'utf-8');
        if(!data){
            fs.writeFile('./data/user.json', JSON.stringify(formatNewData), (err) => {
                if (err) throw err;
                let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
                console.log((`第${counter1}次爬取首页用户购买ajax完毕，时间：${time}`).silly);
            });
        }else{
            let oldData = JSON.parse(data);
            let addData = [];
            // 排重算法，如果uniqueId不一样那肯定是新生成的，否则看时间差如果是0(三分钟内请求多次)或者三分钟则是旧数据
            for(let i=0, len=formatNewData.length; i<len; i++){
                let matchArr = [];
                for(let len2=oldData.length, j=Math.max(0,len2 - 20); j<len2; j++){
                    if(formatNewData[i].uniqueId === oldData[j].uniqueId){
                        matchArr.push(j);
                    }
                }
                if(matchArr.length === 0){
                    addData.push(formatNewData[i]);
                }else{
                    let isNewBuy = true;
                    for(let k=0, len3=matchArr.length; k<len3; k++){
                        let delta = formatNewData[i].time - oldData[matchArr[k]].time;
                        if(delta == 0 || (Math.abs(delta - 3*60*1000) < 1000)){
                            isNewBuy = false;
                            // 更新时间，这样下一次判断还是三分钟
                            oldData[matchArr[k]].time = formatNewData[i].time;
                        }
                    }
                    if(isNewBuy){
                        addData.push(formatNewData[i]);
                    }
                }
            }
            fs.writeFile('./data/user.json', JSON.stringify(oldData.concat(addData)), (err) => {
                if (err) throw err;
                let time = (new Date()).format("yyyy-MM-dd hh:mm:ss");
                console.log((`第${counter1}次爬取首页用户购买ajax完毕，时间：${time}`).silly);
            });
        }
    });
}






