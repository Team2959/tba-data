var global = this;

function namedCache () {
    if (this === global) return namedCache.apply({}, arguments);
  
    this.map = {};
    this.names = [];
    this.maxCount = 20;
  
    this.constructor = namedCache;
    for (func in namedCache.prototypes) {
        this[func] = namedCache.prototypes[func].bind(this); 
    }
  
    return this;
}

namedCache.prototypes = {
    get: function (name) {
        if (name in this.map) {
            return this.map[name];
        }
        
        return null;
    },
    put: function (name, value) {
        // Check if adding a value would exceed the max count
        if (name in this.map) {
            this.map[name] = value;
            return;
        }
      
        while (this.names.length >= this.maxCount) {
            var nameToRemove = this.names.shift();
            delete this.map[nameToRemove];
        }
        
        this.map[name] = value;
        this.names.push(name);
    },
    remove: function (name) {
        if (name in this.map) {
            delete this.map[name];
        }
        
        var idx = this.names.indexOf(name);
        if (idx >= 0) this.names.splice(idx, 1);
    }
};

function objectContainsAll(obj, keys) {
    return keys.reduce(function (a, c) {
        return a & (c in obj);
    }, true);
}

// In the google app script version of javascript there are no direct classes.
// To create a class a new object needs to be created with class members as elements 
// Member functions of the class are elements of the "class" object with their scope set to the object
// `this` is used throughout the class functions to reference the class object itself
function tba(tbaAuthKey) {
    // When the function is executed it's scope will likely be the global scope of the engine
    // To avoid polluting the global scope with the class members the function is re-called with a new object bound as it's scope
    if (this === global) return tba.apply({}, arguments);
    
    // The class must be initialized with a TBA Auth Key, which should be a string
    if (typeof tbaAuthKey !== "string") throw "Invalid tba auth key";
    
    // Class members are created
    this.authKey = tbaAuthKey;                                // the blue alliance auth key used in api requests
    this.tbaBasename = "https://thebluealliance.com/api/v3/"; // the base url for api requests, all specific requests are appended to this url
    // Use the cache service to cache fetch call results
    this.cache = CacheService.getScriptCache();               // The google CacheService instance scoped to this script.
    this.localCache = namedCache();                           // the google cache service doesn't allow large data larger than 100kB to be cached, a limited number of large items will be cached in each cache instance.
    this.analytics = {                                        // The class maintains aggregate analytics for request count and time spent.
        totalTime: 0,
        totalRequests: 0,
        cacheHits: 0,
        cacheTime: 0
    };
  
    this.constructor = tba;
    for (func in tba.prototypes) {
        this[func] = tba.prototypes[func].bind(this);          // Class member functions are bound to the class
    }
  
    return this;
}

tba.prototypes = {
    // standardizeEndpoint accepts an endpoint url and standardizes the use of `/` within it so that it can be used as a key for caches
    standardizeEndpoint: function (endpoint) {
        var segments = endpoint.split("/");
        segments = segments.filter(function (v) { return v.length > 0; });
        //segments.unshift(this.tbaBasename);  
        return segments.join("/");
    },
    // loadCachedValue checks for a cached version of the provided standardized endpoint in the google cache service and the local cache.
    // if the value exists in neither, null is returned
    loadCachedValue: function (stdEndpoint) {
        var fromService = this.cache.get(stdEndpoint);           // Attempt to read the value from the google CacheService
        var fromLocal = this.localCache.get(stdEndpoint);        // Attempt to read the value from the local cache
        try {
            fromService = JSON.parse(fromService);
            if (!objectContainsAll(fromService, ["useUntil", "lastModified", "value"]))
                throw "Invalid cached value";
        } catch (ex) {
            fromService = null;
            this.cache.remove(stdEndpoint);
        }
        try {
            fromLocal = JSON.parse(fromLocal);
            if (!objectContainsAll(fromLocal, ["useUntil", "lastModified", "value"]))
                throw "Invalid cached value";
        } catch (ex) {
            fromLocal = null;
            this.localCache.remove(stdEndpoint);
        }
      
        if (fromService === null && fromLocal === null) {
            return null;
        } else if (fromService === null && fromLocal !== null) {
            return fromLocal;
        } else if (fromService !== null && fromLocal === null) {
            return fromService;
        } else {
            return fromService.useUntil > fromLocal.useUntil ? fromService : fromLocal;
        }
    },
    storeCachedValue: function (stdEndpoint, value) {
        var raw = JSON.stringify(value);
        try {
            this.cache.put(stdEndpoint, raw);
        } catch (ex) {
            this.localCache.put(stdEndpoint, raw);
        }
    },
    totalRequests: function () {
        return this.analytics.totalRequests;
    },
    nonCachedRequests: function () {
        return this.analytics.totalRequests - this.analytics.cacheHits;
    },
    cachedRequests: function () {
        return this.analytics.cacheHits;
    },
    averageRequestTime: function () {
        return this.analytics.totalTime / this.analytics.totalRequests;
    },
    averageNonCachedRequestTime: function () {
        return (this.analytics.totalTime - this.analytics.cacheTime) / (this.analytics.totalRequests - this.analytics.cacheHits);
    },
    averageCachedRequestTime: function () {
        return this.analytics.cacheTime / this.analytics.cacheHits;
    },
    cacheHitRate: function () {
        return this.analytics.totalRequests === 0 ? 0.0: this.analytics.cacheHits / this.analytics.totalRequests;
    },
    
    apiRequest: function (endpoint) {
        this.analytics.totalRequests += 1;
        var start = Date.now();
        // standardize the slashes in the endpoint
        endpoint = this.standardizeEndpoint(endpoint);
        // Add basename to create full URL
        var fullUrl = this.tbaBasename + endpoint;

        // Generate the headers object with TBA Auth Key and User Agent
        var headers = {}
        headers["X-TBA-Auth-Key"] = this.authKey;
        headers["User-Agent"] = "GoogleSheets";
        
        // Check for a cached version of this endpoint
        var cached = this.loadCachedValue(endpoint);
        if (cached !== null) {
            // Check if the cached value is still fresh
            if (Date.now() < cached["useUntil"]) {
                var elapsed = Date.now() - start;
                this.analytics.totalTime += elapsed;
                this.analytics.cacheTime += elapsed;
                this.analytics.cacheHits += 1;
                return cached["value"]; 
            }
            // Set the if modified since header if necessary
            headers["If-Modified-Since"] = cached["lastModified"];
        }
      
        // Attempt the HTTP request
        var response = UrlFetchApp.fetch(fullUrl, {method: "get", headers: headers, muteHttpExceptions: true});
        switch (response.getResponseCode()) {
        case 200: // Good
            // The response should contain JSON data
            try {
                var obj = JSON.parse(response.getContentText());
            } catch (ex) {
                // The response failed, Log and reraise the error
                Logger.log(ex);
                throw ex;
            }
            // Store the new values in the cache
            var resHeaders = response.getHeaders();
            var cacheValue = {
                "useUntil": Date.now(),
                "lastModified": ("Last-Modified" in resHeaders ? resHeaders["Last-Modified"] : ""),
                "value": obj
            };
            
            try {
                var str = new String(resHeaders["Cache-Control"]);
                var result = /(?:max\-age\s*\=\s*)/.exec(str);
                var idx = result.index + result[0].length;
                result = /\d+/.exec(str.substr(idx));
                
                cacheValue["useUntil"] += parseInt(result[0]) * 1000;
            } catch (ex) {
                Logger.log(ex);
            };
            
            this.storeCachedValue(endpoint, cacheValue);
            
            var elapsed = Date.now() - start;
            this.analytics.totalTime += elapsed;
            return obj;
        case 304: // Not modified
            if (!cached) {
                Logger.log("API returned 304 without a valid cache");
                throw "API returned 304 without a valid cache";
            }
            
            var elapsed = Date.now() - start;
            this.analytics.totalTime += elapsed;
            this.analytics.cacheTime += elapsed;
            this.analytics.cacheHits += 1;
            return cached["value"];
        default: // Everything else will be considered an error
            Logger.log("Error on http request");
            throw "Error on http request";
        }
    },
    getAllPages: function (urlBuilder) {
        var result = [], current = null;
        for (var i = 0; true; i++) {
            current = this.apiRequest(urlBuilder(i));
            
            if (!Array.isArray(current) || current.length <= 0) {
                break;
            }

            result = result.concat(current);
        }
        // Logger.log(i);
        return result;
    },
    teams: function (filters_) {
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
        if (arguments.length === 0) {
            // Select all teams
            var endpointGen = function (i) {
                return ["teams", i.toString()].join("/");
            };
            return this.getAllPages(endpointGen);
        } else if (arguments.length === 1) {
            switch (arguments[0].type) {
            case tba.pageNumber:
                var endpoint = ["teams", arguments[0].toString()].join("/");
                return this.apiRequest(endpoint);
            case tba.year:
                var endpointGen = function (year, i) {
                    return ["teams", year.toString(), i.toString()].join("/");
                }.bind({}, arguments[0]);

                return this.getAllPages(endpointGen);
            case tba.eventKey:
                var endpoint = ["event", arguments[0], "teams"].join("/");
                return this.apiRequest(endpoint);
            case tba.districtKey:
                var endpoint = ["district", arguments[0], "teams"].join("/");
                return this.apiRequest(endpoint);
            case tba.teamKey:
                var endpoint = ["team", arguments[0]].join("/");
                return [this.apiRequest(endpoint)];
            default:
                throw "Unknown team filter provided.";
            }
        } else if (arguments.length == 2) {
            var year = (arguments[0].type === tba.year ? arguments[0] : arguments[1]);
            if (year.type !== tba.year) throw "Invalid set of selectors. Expected a year";
            var page_num = (arguments[1].type === tba.pageNumber ? arguments[1] : arguments[0]);
            if (page_num.type !== tba.pageNumber) throw "Invalid set of selectors. Expected a page number";

            var endpoint = ["teams", year.toString(), page_num.toString()].join("/");
            return this.apiRequest(endpoint);
        }
    },
    /************************************************************************************************
     * TODO: implement `events`                                                                     *
     ************************************************************************************************/
    events: function (filters_) {
        /* 
        Find all of the different ways a list of events can be generates.
        Determine which is being used based on the number and type of inputs.
        For enpoints that require a page number, an option should be available 
        without the page number which gets all pages
        
        Making requests should be done by calling this.apiRequest with the provided endpoint url path
        Requesting and concatenating all pages can be done by calling this.getAllPages
        getAllPages accepts a function as it's argument which when called with a provided page number
        should return a url path
        */
        // Check all the valid combinations of filters that can result in a list of events
        /* Valid ways to get events:
        No Arguments: Does not apply
        1  Argument:
            event_key,
            district_key,
            team_key
            year
        2  Arguments:
            year, team_key
        */
       
        if (arguments.length === 1) {
            switch (arguments[0].type) {
            case tba.year:
                var endpoint = ["events", arguments[0].toString()].join("/");
                return this.apiRequest(endpoint);
            case tba.eventKey:
                var endpoint = ["event", arguments[0]].join("/");
                return this.apiRequest(endpoint);
            case tba.districtKey:
                var endpoint = ["district", arguments[0], "events"].join("/");
                return this.apiRequest(endpoint);
            case tba.teamKey:
                var endpoint = ["team", arguments[0], "events"].join("/");
                return [this.apiRequest(endpoint)];
            default:
                throw "Unknown event filter provided.";
            }
        } else if (arguments.length == 2) {
            var year = null, team_key = null;
            if (arguments[0].type === tba.year) {
                year = arguments[0];  
            } else if (arguments[1].type === tba.year) {
                year = arguments[1]; 
            }
            
            if (arguments[0].type === tba.teamKey) {
                team_key = arguments[0];
            } else if (arguments[1].type === tba.teamKey) {
                team_key = arguments[1]; 
            }
            
            if (year === null || team_key === null) {
                throw "Wrong type of arguments."; 
            }
          
          

            var endpoint = ["team", team_key,"events", year.toString()].join("/");
            return this.apiRequest(endpoint);
        } else {
            throw "Wrong number of arguments.";
        }
      
    },
    /************************************************************************************************
     * TODO: implement `event`                                                                      *
     ************************************************************************************************/
    event: function (key) {
        /*
        Find all of the data that can be returned about an event, 
        probably in the form `event/EVENT_KEY/...`.
        Return an object with one element for each separate endpoint with event data.
        Each element will be a function that accepts the necessary arguments for the endpoint
        and return the result of the api call.
        
        
        The object will be in the form:
        return {
            "NAME_OF_FUNCTION": function (NECESSARY_ARGUMENTS) {
                // Validate the type of the necessary argument if any exist
                return this.apiRequest(API_ENDPOINT_PATH);
            }.bind(this, key),
            ...
        }
        */
    },
    matches: function (filters_) {
    
    },
    team: function (key) {
        if (key.type !== tba.teamKey) throw "Expected a team key.";

        return {
            "yearsParticipated": function (key) {
                return this.apiRequest(["team", key, "years_participated"].join("/"));
            }.bind(this, key),
            "districts": function (key) {
                return this.apiRequest(["team", key, "districts"].join("/"));
            }.bind(this, key),
            "robots": function (key) {
                return this.apiRequest(["team", key, "robots"].join("/"));
            }.bind(this, key),
            "events": function (key) {
                return this.apiRequest(["team", key, "events"].join("/"));
            }.bind(this, key),
            "simpleEvents": function (key) {
                return this.apiRequest(["team", key, "events", "simple"].join("/"));
            }.bind(this, key),
            "eventKeys": function (key) {
                return this.apiRequest(["team", key, "events", "keys"].join("/"));
            }.bind(this, key),
            "eventsInYear": function (key, year) {
                if (year.constructor !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "events", year.toString()].join("/"));
            }.bind(this, key),
            "simpleEventsInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "events", year.toString(), "simple"].join("/"));
            }.bind(this, key),
            "eventKeysInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "events", year.toString(), "keys"].join("/"));
            }.bind(this, key),
            "eventStatusesInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "events", year.toString(), "statuses"].join("/"));
            }.bind(this, key),
            "eventMatches": function (key, event) {
                if (event.type !== tba.eventKey) throw "Expected an event key.";
                return this.apiRequest(["team", key, "event", event, "matches"].join("/"));
            }.bind(this, key),
            "eventSimpleMatches": function (key, event) {
                if (event.type !== tba.eventKey) throw "Expected an event key.";
                return this.apiRequest(["team", key, "event", event, "matches", "simple"].join("/"));
            }.bind(this, key),
            "eventMatchKeys": function (key, event) {
                if (event.type !== tba.eventKey) throw "Expected an event key.";
                return this.apiRequest(["team", key, "event", event, "matches", "keys"].join("/"));
            }.bind(this, key),
            "eventAwards": function (key, event) {
                if (event.type !== tba.eventKey) throw "Expected an event key.";
                return this.apiRequest(["team", key, "event", event, "awards"].join("/"));
            }.bind(this, key),
            "eventStatus": function (key, event) {
                if (event.type !== tba.eventKey) throw "Expected an event key.";
                return this.apiRequest(["team", key, "event", event, "status"].join("/"));
            }.bind(this, key),
            "awards": function (key) {
                return this.apiRequest(["team", key, "awards"].join("/"));
            }.bind(this, key),
            "awardsInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "awards", year.toString()].join("/"));
            }.bind(this, key),
            "matchesInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "matches", year.toString()].join("/"));
            }.bind(this, key),
            "simpleMatchesInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "matches", year.toString(), "simple"].join("/"));
            }.bind(this, key),
            "matchKeysInYear": function (key, year) {
                if (year.type !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "matches", year.toString(), "keys"].join("/"));
            }.bind(this, key),
            /*"mediaInYear": function (key, year) {
                if (year.constructor !== tba.year) throw "Expected a year.";
                return this.apiRequest(["team", key, "media", year.toString()].join("/"));
            }.bind(this, key),
            "mediaByTag": function (key, media) {

            }.bind(this, key),
            "mediaByTagInYear": function (key, media, year) {}.bind(this, key),*/
            "socialMedia": function (key) {
                return this.apiRequest(["team", key, "social_media"].join("/"));
            }.bind(this, key)
        }
    }
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
    return (typeof year === "number") && ((year | 0) === year) && (year >= 1992 && year <= (new Date()).getFullYear());
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

function Test() {
    var TBA = tba("Krm8Gg4CDQHpCk8Dg7pJLXkqP77YQNkauQoawhSE5wZyBfGEb6iltLn7W12c6hWV");
    var y2018p2 = TBA.teams(tba.year(2018), tba.pageNumber(2));
    var frc2959 = TBA.teams(tba.teamKey("frc2959"));
    var allTeams = TBA.teams();
    Logger.log(y2018p2.length);
    Logger.log(frc2959);
    Logger.log(allTeams.length);
    Logger.log(TBA.team(tba.teamKey("frc2959")).simpleEventsInYear(tba.year(2019)));
}
