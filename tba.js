var global = this;

function localCache () {
    // Avoid clobbering the global scope
    var self = {};

    if (self === global) {
        return localCache.apply({}, arguments);
    }

    self.map   = {};
    self.names = [];
    self.maxEntries = 32;

    var selfFns = {
        get: function (name) {
            if (name in this.map) {
                return this.map[name];
            }
    
            return null;
        },
        put: function (name, value) {
            if (name in this.map) {
                this.map[name] = value;
                return;
            }
    
            while (this.names.length >= this.maxEntries) {
                var nameToRemove = this.names.shift();
                delete this.map[nameToRemove];
            }
    
            this.map[name] = value;
            this.names.push(name);
        },
        remove: function (name) {
            delete this.map[name];
    
            var idx = this.names.indexOf(name);
            if (idx >= 0) {
                this.names.splice(idx, 1);
            }
        },
    };

    for (var funcName in selfFns) {
        self[funcName] = selfFns[funcName].bind(self);
    }

    return self;
}

function analyticWrapper () {
    // Avoid clobbering the global scope
    var self = {};

    if (self === global) {
        return analyticWrapper.apply({}, arguments);
    }

    self.totalTime = 0;
    self.totalRequests = 0;
    self.cachedRequests = 0;
    self.cacheTime = 0;

    self.currentStartTime = 0;

    var selfFns = {
        requestStart: function () {
            this.currentStartTime = Date.now();
        },
        requestEndCached: function () {
            var diff = Date.now() - this.currentStartTime;
            this.cacheTime += diff;
            this.totalTime += diff;
    
            this.totalRequests += 1;
            this.cachedRequests += 1;
        },
        requestEnd: function () {
            var diff = Date.now() - this.currentStartTime;
            this.totalTime += diff;
            this.totalRequests += 1;
        },
        reset: function () {
            this.totalRequests = 0;
            this.cachedRequests = 0;
            this.totalTime = 0;
            this.cacheTime = 0;
        },
        totalReqs: function () {
            return this.totalRequests;
        },
        cachedReqs: function () {
            return this.cachedRequests;
        },
        nonCachedReqs: function () {
            return this.totalRequests - this.cachedRequests;
        },
        avgReqTime: function () {
            return this.totalTime / this.totalRequests;
        },
        avgCachedReqTime: function () {
            return this.cacheTime / this.cachedRequests;
        },
        avgNonCachedReqTime: function () {
            return (this.totalTime - this.cacheTime) / (this.totalRequests - this.cachedRequests);
        },
        cacheHitRate: function () {
            return this.totalRequests / this.cachedRequests;
        }
    };

    for (var funcName in selfFns) {
        self[funcName] = selfFns[funcName].bind(self);
    }

    return self;
}

Array.prototype.insertAfter = function (i, v) {
    for (; this[i] !== undefined; i++);
    this[i] = v;
    return i;
}

function clearNulls(inputArray) {
  for (i = inputArray.length - 1; i>=0; i--)
  {
    if (inputArray[i] === null)
    {
      inputArray.splice(i,1);
    }
  }
  return (inputArray);
}

// In the google app script version of javascript there are no direct classes.
// To create a class a new object needs to be created with class members as elements 
// Member functions of the class are elements of the "class" object with their scope set to the object
// `this` is used throughout the class functions to reference the class object itself
function tba(authKey) {
    // If this function call inherited the global scope
    // we don't want to smash lots of new variables onto it
    // we will return a new call with the same arguments
    // bound to a new object as the scope (this).
    /*for (var entry in this)
        return tba.apply({}, arguments);*/
    var self = {};

    // Validate the type of the provided authKey
    // Inform the user of errors
    if (typeof authKey !== "string") {
        throw "Invalid type for authKey. Expected a string.";
    }

    // Setup the 'class' members
    self.authKey = authKey;
    self.baseName = "https://thebluealliance.com/api/v3/";
    
    // Setup caching.
    // Any number of caches should be able to be supported
    self.caches = [];
    // Include the Google CacheService as one of the caches
    self.caches.push(CacheService.getScriptCache());
    self.caches.push(localCache());
    // Include an anayltics object for performance timing.
    self.analytics = analyticWrapper();
    
    self.teamPageCount = null;
    self.pagesReqd = 0;

    // Set the constructor to this function
    // this.prototype.constructor = tba;
    // Set up the prototype methods.
    // These need to be added as childen to `this` and bound to it
    var selfFns = {
        loadCached: function (name) {
            var recentVal = null;
            for (var i = 0; i < this.caches.length; i++) {
                var cached = this.caches[i].get(name);
                // Check that the cached value is valid
                try {
                    cached = JSON.parse(cached);
                    if (!tba.isCachedValue(cached)) {
                        throw "Invalid cached value. Removing."
                    }
    
                    if (recentVal === null || cached.useUntil >= recentVal.useUntil) {
                        recentVal = cached;
                    }
                } catch (ex) {
                    this.caches[i].remove(name);
                }
            }
            return recentVal;
        },
        storeCached: function (name, value) {
            var str = JSON.stringify(value);
            for (var i = 0; i < this.caches.length; i++) {
                try {
                    this.caches[i].put(name, str);
                    break;
                } catch (ex) {}
            }
        },
        getCacheHeaders: function (headers) {
            var cacheValue = {
                value: null,
                useUntil: Date.now(),
                lastModified: ""
            };
    
            if ("Last-Modified" in headers) {
                cacheValue.lastModified = headers["Last-Modified"];
            }
    
            try {
                var str = new String(headers["Cache-Control"]);
                var result = /(?:max\-age\s*\=\s*)/.exec(str);
                var idx = result.index + result[0].length;
                result = /\d+/.exec(str.substr(idx));
                
                cacheValue.useUntil += (parseInt(result[0]) * 1000);
            } catch (ex) {}
    
            return cacheValue;
        },
        
        handleResponse: function (endPoint, url, cached, response) {
            switch (response.getResponseCode()) {
            case 200:
                // Attempt to load the response data as JSON
                try {
                    var obj = JSON.parse(response.getContentText());
                } catch (ex) {
                    throw "The server returned invalid JSON. " + ex;
                }

                if (!Array.isArray(obj)) {
                    obj = [obj];
                }
    
                // The response is valid JSON it can be stored in the cache
                var respHeaders = response.getHeaders();
                var cacheValue = this.getCacheHeaders(respHeaders);
                cacheValue.value = obj;
                this.storeCached(endPoint, cacheValue);
    
                this.analytics.requestEnd();
                return obj;
            case 304:
                if (cached === null) {
                    throw "Recieved 304 without a cached value.";
                }
    
                this.analytics.requestEndCached();
                return cached.value;
            default:
                throw "Error making request. Server returned code " + response.getResponseCode() + " for URL " + url;
            }
        },
        validatePathSegments: function (pathSegments) {
            if (typeof pathSegments === "string") {
                pathSegments = pathSegments.split("/").filter(function (v) {
                    return v.length >= 1;
                });
            } else if (!Array.isArray(pathSegments)) {
                throw "Invalid request path. Expected astring or an array.";
            }
          
            return pathSegments.join("/");
        },
        buildRequestHeaders: function (cached) {
            var headers = {
                "X-TBA-Auth-Key": this.authKey,
                "User-Agent": "GoogleSheets",
            };
            if (cached !== null) {
                // Stale cached value found
                headers["If-Modified-Since"] = cached.lastModified;
            }

            return headers;
        },
        apiRequest: function (pathSegments) {
            // Validate the type of the provided input
            var endPoint = this.validatePathSegments(pathSegments);
            var url      = this.baseName + endPoint;
            
            this.analytics.requestStart();
            // Attempt to load the value from the cache
            var cached = this.loadCached(endPoint);
            if (cached !== null && cached.useUntil > Date.now()) {
                // Fresh cached value found
                this.analytics.requestEndCached();
                return cached.value;
            }
            var headers = this.buildRequestHeaders(cached);
    
            var response = UrlFetchApp.fetch(url, {method: "get", headers: headers, muteHttpExceptions: true});
            return this.handleResponse(endPoint, url, cached, response);
        },
        getAllPages: function (urlBuilder, pageCount) {
            if (typeof pageCount === "undefined") {
                // The exact page count is unknown, make requests until an error or an empty array is returned
                // Requests should be batched and made together using UrlFetchApp.fetchAll
                var results = [], j = 0;
                var batchSize = 11;
                for (var cont = true, b = 0; cont; b += batchSize) {
                    results.length += batchSize;
                    var reqs = [], reqEps = [], stale = [];
                    for (var i = 0; i < batchSize; i++) {
                        // Build an array of all necessary requests.
                        var endPoint = this.validatePathSegments(urlBuilder(b + i));
                        var url = this.baseName + endPoint;
                        var cached = this.loadCached(endPoint);
                        if (cached !== null && cached.useUntil > Date.now()) {
                            // Fresh cached value found
                            results[b+i] = cached.value;
                        } else {
                            stale.push(cached === null ? null : cached.value);
                            var headers = this.buildRequestHeaders(cached);
                            reqEps.push(endPoint);
                            reqs.push({
                                url: url,
                                method: "get",
                                headers: headers,
                                muteHttpExceptions: true
                            });
                        }
                    }
                    var resps = UrlFetchApp.fetchAll(reqs);
                    for (var i = 0; i < resps.length; i++) {
                        var obj = this.handleResponse(reqEps[i], reqs[i].url, stale[i], resps[i]);
                        if (!Array.isArray(obj) || obj.length <= 0) {
                            cont = false;
                            break;
                        }
                        j = results.insertAfter(j, obj);
                        j++;
                        this.pagesReqd = j;
                    }
                }

                var r = [];
                results.forEach(function (v) {
                    r = r.concat(v);
                });
                return r;

            } else {
                var reqs = [], reqEps = [], stale = [], results = new Array(pageCount);
                for (var i = 0; i < pageCount; i++) {
                    // Build an array of all necessary requests.
                    var endPoint = this.validatePathSegments(urlBuilder(i));
                    var url = this.baseName + endPoint;
                    var cached = this.loadCached(endPoint);
                    if (cached !== null && cached.useUntil > Date.now()) {
                        // Fresh cached value found
                        results[i] = cached.value;
                    } else {
                        stale.push(cached.value);
                        var headers = this.buildRequestHeaders(cached);
                        reqEps.push(endPoint);
                        reqs.push({
                            url: url,
                            method: "get",
                            headers: headers,
                            muteHttpExceptions: true
                        });
                    }
                }
                var resps = UrlFetchApp.fetchAll(reqs);
                for (var i = 0, j = 0; i < resps.length; i++) {
                    var obj = this.handleResponse(reqEps[i], reqs[i].url, stale[i], resps[i]);
                    if (!Array.isArray(obj) || obj.length <= 0) {
                        exit = true;
                        break;
                    }
                    j = results.insertAfter(j, obj);
                    j++;
                }

                var r = [];
                results.forEach(function (v) {
                    r = r.concat(v);
                });
                return r;
            }
        },
      
        api_status: function (filters_) { 
            
            // Check all the valid combinations of filters that can result in api status
            /* Valid ways to get api status:
            No Arguments: 
                    This funtion is called without argument
            1  Argument:
                    None
            2  Arguments:
                    None
            */
            switch (arguments.length) {
            case 0:
                    var endpoint = ["status"];
                    return this.apiRequest(endpoint)
        
            default:
                throw "Expected no arguments."
            } 
        },
      
        award: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of XXX
            /* Valid ways to get XXX:
            No Arguments: None
            1  Argument: 
                  team_key
                  event_key
            
            2  Arguments:
                  team_key, event_key
                  team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.teamKey:
                    var endpoint = ["team", args[0].toString(), "awards"];
                    return this.apiRequest(endpoint);
                case tba.eventKey:
                    var endpoint = ["event", args[0], "awards"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected team key or event key";
                }
            case 2:
                var team_key = (args[0].type === tba.teamKey ? args[0] : args[1]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                
                var other_key = (args[0].type === tba.teamKey ? args[1] : args[0]);
                switch (other_key.type) {
                case tba.eventKey:
                    var endpoint = ["team", team_key, "event", other_key, "awards"];
                    return this.apiRequest(endpoint);
                     
                  case tba.year:
                    var endpoint = ["team", team_key, "awards", other_key.toString()];
                    return this.apiRequest(endpoint);
                     
                default:
                    throw "Expected year or event key"; 
                }
                    
            default:
                throw "Wrong number of arguments.";
            }        
        },
      
        district_list: function (filters_) { 
        
          // Check all the valid combinations of filters that can result in a list of disticts
            /* Valid ways to get districts:
            No Arguments: 
                    None
            1  Argument:
                    year
                    team_key 
            
            2  Arguments:
                    None
           
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.year:
                    var endpoint = ["districts", args[0].toString()];
                    return this.apiRequest(endpoint);
                case tba.teamKey:
                    var endpoint = ["team", args[0],"districts"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected year or team key.";
                }
                
            default:
                throw "Wrong number of arguments.";
            } 
        },
      
        district_ranking: function (filters_) { 
        
            // Check all the valid combinations of filters that can result in a list of district rankings
            /* Valid ways to get district rankings:
            No Arguments: 
                    None
            1  Argument:
                    district_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.districtKey:
                    var endpoint = ["district", args[0], "rankings"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected district key.";
                }
            default:
                throw "Wrong number of arguments";
            } 
        },
      
        elimination_alliance: function (filters_) { 
           
            // Check all the valid combinations of filters that can result in a list of elimination alliance
            /* Valid ways to get eleimination alliance:
            No Arguments: 
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "alliances"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
 
            default:
                throw "Wrong number of arguments"
            } 
        },
      
        event: function (filters_) { 
        
            // Check all the valid combinations of filters that can result in an event
            /* Valid ways to get an event:
            No Arguments: 
                    None
            1  Argument:
                    district_key
                    event_key
                    year
                    team_key
            2  Arguments:
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.year:
                    var endpoint = ["events", args[0].toString()];
                    return this.apiRequest(endpoint);    
                case tba.eventKey:
                    var endpoint = ["event", args[0]];
                    return this.apiRequest(endpoint);
                case tba.districtKey:
                    var endpoint = ["district", args[0], "events"];
                    return this.apiRequest(endpoint);
                case tba.teamKey:
                    var endpoint = ["team", args[0], "events"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected district key, event key, year, or team key.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
    
                var endpoint = ["team",team_key,"events", year.toString()];
                return this.apiRequest(endpoint);
            default:
                throw "Wrong number of arguments";
            }  
        },
      
        event_district_points: function (filters_) { 
                    // Check all the valid combinations of filters that can result in a list of event district points
            /* Valid ways to get event district points:
            No Arguments: 
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "district_points"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }

            default:
                throw "Wrong number of arguments."
            } 
        },
      
        event_insights: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event insights
            /* Valid ways to get event insites:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "insights"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
            default:
                throw "Wrong number of arguments."
            }
        },
      
        event_keys_array: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event keys
            /* Valid ways to get event keys:
            No Arguments:
                    None
            1  Argument:
                    district_key
                    year
                    team_key
            2  Arguments:
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.districtKey:
                    var endpoint = ["district", args[0], "events", "keys"];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpoint = ["events", args[0].toString(), "keys"];
                    return this.apiRequest(endpoint);
                case tba.team_key:
                    var endpoint = ["team", args[0], "events", "keys"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected district key, year, or team key.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
    
                var endpoint = ["team",team_key,"events", year.toString(), "keys"];
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        event_oprs: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event oprs
            /* Valid ways to get event oprs:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "oprs"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
            default:
                throw "Wrong number of arguments."
            }
        },
      
        event_predictions: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event predictions
            /* Valid ways to get event predictions:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "predictions"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
            default:
                throw "Wrong number of arguments."
            }        
        },
      
        event_ranking: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event rankings
            /* Valid ways to get event rankings:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "rankings"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
            default:
                throw "Wrong number of arguments."
            }        
        },
      
        event_simple: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of events (simple)
            /* Valid ways to get events (simple):
            No Arguments:
                    None
            1  Argument:
                    district_key
                    year
                    team_key
                    event_key
            2  Arguments:
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.districtKey:
                    var endpoint = ["district", args[0], "events", "simple"];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpoint = ["events", args[0].toString(), "simple"];
                    return this.apiRequest(endpoint);
                case tba.team_key:
                    var endpoint = ["team", args[0], "events", "simple"];
                    return this.apiRequest(endpoint);
                case tba.eventKey:
                    var endpoint = ["event", args[0], "simple"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected district key, year, team key, or event key.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
    
                var endpoint = ["team",team_key,"events", year.toString(), "simple"];
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        match: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of matches
            /* Valid ways to get matches:
            No Arguments:
                    None
            1  Argument:
                    match_key
                    year
            2  Arguments:
                    team_key, event_key
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.matchKey:
                    var endpoint = ["match", args[0]];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpoint = ["event", args[0].toString(), "matches"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected match key or event key.";
                }
            case 2:
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) {
                  var event_key = (args[0].type === tba.eventKey ? args[0] : args[1]);
                  if (event_key.type !== tba.eventKey) throw "Invalid set of selectors.  Expected team key and year or event key.";
                  var endpoint = ["team",team_key,"event", event_key, "matches"];
                }
                else {
                  var endpoint = ["team",team_key,"matches", year.toString()];
                }
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        match_keys_array: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of match keys
            /* Valid ways to get match keys:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    team_key, event_key
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "matches", "keys"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected match key or event key.";
                }
            case 2:
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) {
                  var event_key = (args[0].type === tba.eventKey ? args[0] : args[1]);
                  if (event_key.type !== tba.eventKey) throw "Invalid set of selectors.  Expected team key and year or event key.";
                  var endpoint = ["team",team_key,"event", event_key, "matches", "keys"];
                }
                else {
                  var endpoint = ["team",team_key,"matches", year.toString(), "keys"];
                }
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        match_simple: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of matches (simple)
            /* Valid ways to get matches (simple):
            No Arguments:
                    None
            1  Argument:
                    match_key
                    event_key
            2  Arguments:
                    team_key, event_key
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.matchKey:
                    var endpoint = ["match", args[0], "simple"];
                    return this.apiRequest(endpoint);
                case tba.event_key:
                    var endpoint = ["event", args[0], "matches", "simple"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected match key or event key.";
                }
            case 2:
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) {
                  var event_key = (args[0].type === tba.eventKey ? args[0] : args[1]);
                  if (event_key.type !== tba.eventKey) throw "Invalid set of selectors.  Expected team key and year or event key.";
                  var endpoint = ["team",team_key,"event", event_key, "matches", "simple"];
                }
                else {
                  var endpoint = ["team",team_key,"matches", year.toString(), "simple"];
                }
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        media: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of media
            /* Valid ways to get media:
            No Arguments:
                    None
            1  Argument:
                    team_key
            2  Arguments:
                    team_key, media_tag
                    team_key, year
            3  Arguments:
                    team_key, media_tag, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.teamKey:
                    var endpoint = ["match", args[0], "simple"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected match key or event key.";
                }
            case 2:
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) {
                  var media_tag = (args[0].type === tba.mediaTag ? args[0] : args[1]);
                  if (media_tag.type !== tba.mediaTag) throw "Invalid set of selectors.  Expected team key and year or media tag.";
                  var endpoint = ["team",team_key,"media", "tag", media_tag];
                }
                else {
                  var endpoint = ["team",team_key,"media", "tag", media_tag, year.toString()];
                }
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        team: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of teams
            /* Valid ways to get teams:
            No Arguments: All pages
            1  Argument:
                page_num
                event_key,
                district_key,
                team_key
                year, All pages
            2  Arguments:
                year, page_num
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 0:
                // Select all teams
                var endpointGen = function (i) {
                    return ["teams", i.toString()];
                };
                if (this.teamPageCount !== null) {
                    return this.getAllPages(endpointGen, this.teamPageCount);
                } else {
                    var results = this.getAllPages(endpointGen);
                    this.teamPageCount = this.pagesReqd;
                    return results;
                }
            case 1:
                switch (args[0].type) {
                case tba.pageNumber:
                    var endpoint = ["teams", args[0].toString()];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpointGen = function (year, i) {
                        return ["teams", year.toString(), i.toString()];
                    }.bind({}, args[0]);
    
                    return this.getAllPages(endpointGen);
                case tba.eventKey:
                    var endpoint = ["event", args[0], "teams"];
                    return this.apiRequest(endpoint);
                case tba.districtKey:
                    var endpoint = ["district", args[0], "teams"];
                    return this.apiRequest(endpoint);
                case tba.teamKey:
                    var endpoint = ["team", args[0]];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected a page number, event key, district key, team key or year.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var page_num = (args[1].type === tba.pageNumber ? args[1] : args[0]);
                if (page_num.type !== tba.pageNumber) throw "Invalid set of selectors. Expected a page number";
    
                var endpoint = ["teams", year.toString(), page_num.toString()];
                return this.apiRequest(endpoint);
            default:
                throw "Invalid number of team filters."
            }
        },
      
        team_event_status: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of event statuses
            /* Valid ways to get event statuses:
            No Arguments:
                    None
            1  Argument:
                    event_key
            2  Arguments:
                    team_key, event_key
                    team_key, year
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.eventKey:
                    var endpoint = ["event", args[0], "teams", "statuses"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected event key.";
                }
            case 2:
                var team_key = (args[1].type === tba.teamKey ? args[1] : args[0]);
                if (team_key.type !== tba.teamKey) throw "Invalid set of selectors. Expected a team key";
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) {
                  var event_key = (args[0].type === tba.eventKey ? args[0] : args[1]);
                  if (event_key.type !== tba.eventKey) throw "Invalid set of selectors.  Expected team key and year or event key.";
                  var endpoint = ["team",team_key,"event", event_key, "statuses"];
                }
                else {
                  var endpoint = ["team",team_key,"events", year.toString(), "statuses"];
                }
                return this.apiRequest(endpoint);
             default:
                throw "Wrong number of arguments."
            }        
        },
      
        team_keys_array: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of team keys
            /* Valid ways to get team keys:
            No Arguments: All pages
            1  Argument:
                page_num
                event_key,
                district_key,
                year, All pages
            2  Arguments:
                year, page_num
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 0:
                // Select all teams
                var endpointGen = function (i) {
                    return ["teams", i.toString(), "keys"];
                };
                if (this.teamPageCount !== null) {
                    return this.getAllPages(endpointGen, this.teamPageCount);
                } else {
                    var results = this.getAllPages(endpointGen);
                    this.teamPageCount = this.pagesReqd;
                    return results;
                }
            case 1:
                switch (args[0].type) {
                case tba.pageNumber:
                    var endpoint = ["teams", args[0].toString(), "keys"];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpointGen = function (year, i) {
                        return ["teams", year.toString(), i.toString(), "keys"];
                    }.bind({}, args[0]);
    
                    return this.getAllPages(endpointGen);
                case tba.eventKey:
                    var endpoint = ["event", args[0], "teams", "keys"];
                    return this.apiRequest(endpoint);
                case tba.districtKey:
                    var endpoint = ["district", args[0], "teams", "keys"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected a district key, event key, page number or year.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var page_num = (args[1].type === tba.pageNumber ? args[1] : args[0]);
                if (page_num.type !== tba.pageNumber) throw "Invalid set of selectors. Expected a page number";
    
                var endpoint = ["teams", year.toString(), page_num.toString(), "keys"];
                return this.apiRequest(endpoint);
            default:
                throw "Invalid number of team filters."
            }
        },
      
        team_robot: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of team robots
            /* Valid ways to get team robots:
            No Arguments:
                    None
            1  Argument:
                    team_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.teamKey:
                    var endpoint = ["team", args[0], "robots"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected team key.";
                }
            default:
                throw "Wrong number of arguments."
            }        
        },
      
        team_simple: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of teams (simple)
            /* Valid ways to get teams (simple):
            No Arguments: All pages
            1  Argument:
                page_num
                event_key,
                district_key,
                team_key
                year, All pages
            2  Arguments:
                year, page_num
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 0:
                // Select all teams
                var endpointGen = function (i) {
                    return ["teams", i.toString(), "simple"];
                };
                if (this.teamPageCount !== null) {
                    return this.getAllPages(endpointGen, this.teamPageCount);
                } else {
                    var results = this.getAllPages(endpointGen);
                    this.teamPageCount = this.pagesReqd;
                    return results;
                }
            case 1:
                switch (args[0].type) {
                case tba.pageNumber:
                    var endpoint = ["teams", args[0].toString(), "simple"];
                    return this.apiRequest(endpoint);
                case tba.year:
                    var endpointGen = function (year, i) {
                        return ["teams", year.toString(), i.toString(), "simple"];
                    }.bind({}, args[0]);
    
                    return this.getAllPages(endpointGen);
                case tba.eventKey:
                    var endpoint = ["event", args[0], "teams", "simple"];
                    return this.apiRequest(endpoint);
                case tba.districtKey:
                    var endpoint = ["district", args[0], "teams", "simple"];
                    return this.apiRequest(endpoint);
                case tba.teamKey:
                    var endpoint = ["team", args[0], "simple"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected a page number, event key, district key, team key or year.";
                }
            case 2:
                var year = (args[0].type === tba.year ? args[0] : args[1]);
                if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
                var page_num = (args[1].type === tba.pageNumber ? args[1] : args[0]);
                if (page_num.type !== tba.pageNumber) throw "Invalid set of selectors. Expected a page number";
    
                var endpoint = ["teams", year.toString(), page_num.toString(), "simple"];
                return this.apiRequest(endpoint);
            default:
                throw "Invalid number of team filters."
            }
        },

        years_participated_array: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of years participated
            /* Valid ways to get years participated:
            No Arguments:
                    None
            1  Argument:
                    team_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.teamKey:
                    var endpoint = ["team", args[0], "years_participated"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected team key.";
                }
            default:
                throw "Wrong number of arguments."
            }        
        },
      
        years_participated_array: function (filters_) { 
            // Check all the valid combinations of filters that can result in a list of years participated
            /* Valid ways to get years participated:
            No Arguments:
                    None
            1  Argument:
                    team_key
            2  Arguments:
                    None
            */
            var args = clearNulls(Array.prototype.slice.call(arguments));
            switch (args.length) {
            case 1:
                switch (args[0].type) {
                case tba.teamKey:
                    var endpoint = ["team", args[0], "years_participated"];
                    return this.apiRequest(endpoint);
                default:
                    throw "Expected team key.";
                }
            default:
                throw "Wrong number of arguments."
            }        
        },
    };

    for (var funcName in selfFns) {
        self[funcName] = selfFns[funcName].bind(self);
    }

    // Return the newly setup object
    return self;
}

tba.isCachedValue = function (val) {
    return ("useUntil" in val) && ("lastModified" in val) && ("value" in val);
};

tba.teamKey = function (key) {
    if (!tba.isTeamKey(key)) {
        throw "Invalid team key";
    }
    var str = new String(key)
    str.type = tba.teamKey;
    return str;
};
tba.eventKey = function (key) {
    if (!tba.isEventKey(key)) {
        throw "Invalid event key";
    }
    var str = new String(key);
    str.type = tba.eventKey;
    return str;
};
tba.districtKey = function (key) {
    if (!tba.isDistrictKey(key)) {
        throw "Invalid district key";
    }
    var str = new String(key);
    str.type = tba.districtKey;
    return str;
};
tba.matchKey = function (key) {
    if (!tba.isMatchKey(key)) {
        throw "Invalid event key";
    }
    var str = new String(key);
    str.type = tba.matchKey;
    return str;
};
tba.pageNumber = function (num) {
    if (!tba.isPageNum(num)) {
        throw "Invalid page number";
    }
    var n = new Number(num);
    n.type = tba.pageNumber;
    return n;
};
tba.year = function (year) {
    if (!tba.isYear(year)) {
        throw "Invalid year";
    }
    var y = new Number(year)
    y.type = tba.year;
    return y;
};
/*tba.mediaTag = function (tag) {
    if (!tba.isMediaTag(tag)) {
        throw "Invalid media tag";
    }
    tag.constructor = tba.mediaTag;
    return tag;
};*/


tba.isTeamKey = function (id) {
    // Check that the value is a string and matches the pattern "frc" followed by 1 or more digits
    return (typeof id === "string") && (/^frc[0-9]+$/i.test(id));
};
tba.isYear = function (year) {
    // Check that the value is a number, an integer (non floating point), and in the range new 1992 - current year
    return (typeof year === "number") && ((year | 0) === year) && (year >= 1992 && year <= (new Date()).getFullYear()+1);
};
tba.isPageNum = function (num) {
    // Check that the value is a number, an integer, and greater than or equal to 0
    return (typeof num === "number") && ((num | 0) === num) && (num >= 0);
};
tba.isDistrictKey = function (id) {
    return (typeof id === "string") && (/^[0-9]{4}[a-z]+$/i.test(id));
};
tba.isEventKey = function (id) {
    return (typeof id === "string") && (/^[0-9]{4}[a-z]+$/i.test(id));
};
tba.isMatchKey = function (id) {
  return (typeof id === "string") && (/^[0-9]{4}[a-z]+\_(qm|ef|qf|sf|f)[0-9]+$/.test(id));
};

function flattenObj(obj, out, header) {
  if (typeof out === "undefined") out = {};
  if (typeof header === "undefined") header = "";
  if (typeof obj !== "object") {
    out[header] = obj;
  } else {
    for (var key in obj) {
      if (Array.isArray(obj[key])) {
        flattenObj(obj[key], out, header + key + ".");
      } else if (typeof obj[key] === "object") {
        flattenObj(obj[key], out, header + key + ".");
      } else {
        out[header + key] = obj[key];
      }
    }
  }
  return out;
}


