const request = require('request');
var {getHostFromWebservice, cookiesToStr, parseCookieStr, fillCookies, newId, fillDefaults} = require("./../helper");


module.exports = {
  list(callback = function() {}) {
    var self = this;
    var host = getHostFromWebservice(self.account.webservices.contacts);

    if(typeof offset == 'undefined')
        offset=0;
    if(typeof limit == 'undefined')
        limit = 200;
    var totalContactsCount = 0;

    var requestPromise = new Promise(function(resolve, reject) {
      request.get("https://" + host + "/co/startup?clientBuildNumber=" + self.clientSettings.clientBuildNumber + "&clientId=" + self.clientId + "&clientMasteringNumber=" + self.clientSettings.clientMasteringNumber + "&clientVersion=2.1&dsid=" + self.account.dsInfo.dsid + "&locale=de_DE&order=first%2Clast", {
        headers: fillDefaults({
          'Host': host,
          'Cookie': cookiesToStr(self.auth.cookies)
        }, self.clientSettings.defaultHeaders)
      }, async function(err, response, body) {
        if (err) {
          reject(err);
          return callback(err);
        }
        var result = JSON.parse(body);

        self.Contacts.syncToken = result.syncToken;
        self.Contacts.prefToken = result.prefToken;

        let totalContactsCount = result.contactsOrder.length;
        let fetchedContactsCount = result.contacts.length;
        let pagesToFetch = Math.ceil((totalContactsCount - fetchedContactsCount) / limit);

        if(totalContactsCount > fetchedContactsCount) {
            
            console.log('[iCloud->Contacts] Fetched ' + fetchedContactsCount + ' of ' + totalContactsCount + ' contacts, fetching the rest now...');
            const allContacts = await self.Contacts.__fetchContactsPages(result.contacts, fetchedContactsCount, 200).then((contacts) => {
                  if (contacts.length > 1) {
                    result.contacts = contacts;
                    callback(null, result);
                    return resolve(result);
                  } else {
                    return reject('Nope. Try again.');
                  }
              }, (error) => { reject(error); });            
        }
      });
    });

    return requestPromise;
  },
  __fetchContactsPages(contacts, offset, limit) {
    var self = this;
    var host = getHostFromWebservice(self.account.webservices.contacts);

    // set defaults
    if(typeof offset == 'undefined')
        offset=0;
    if(typeof limit == 'undefined')
        limit = 200;

    if (!("syncToken" in self.Contacts)) {
        var errorObj = {
          error: 'No "syncToken" found! Please call "Contacts.list()" to initialize the Contacts services!',
          errorCode: 4
        };
        reject(errorObj);
        return callback(errorObj);
      }

    // DEBUG
    console.log('fetchPage called with ' + contacts.length + ' contacts, offset: ' + offset + ' limit: ' + limit);

    return new Promise((resolve, reject) => 
        self.Contacts.__contactsPageRequest(offset, limit)
            .then(response => {
                if(!"contacts" in response)
                    console.log(response);

                const newContacts = contacts.concat(response.contacts);
                if(response.contacts.length === 0) {
                    console.log('[iCloud->Contacts] No additional contacts found');
                    resolve(newContacts);
                } else {
                    console.log('[iCloud->Contacts] Fetch progress ' + newContacts.length + ' recursing...');
                    self.Contacts.__fetchContactsPages(newContacts, offset+limit, limit)
                        .then(resolve)
                        .catch(reject)
                }
            }).catch(reject));
  },
  __contactsPageRequest(offset, limit) {
    var self = this;
    var host = getHostFromWebservice(self.account.webservices.contacts);

    return new Promise(function(resolve, reject) {
        let requestUrl = "https://" + host + "/co/contacts/" + 
            "?clientBuildNumber=" + self.clientSettings.clientBuildNumber + 
            "&clientId=" + self.clientId + 
            "&clientMasteringNumber=" + self.clientSettings.clientMasteringNumber + 
            "&clientVersion=2.1&dsid=" + self.account.dsInfo.dsid + 
            "&limit=" + limit + 
            "&locale=" + self.clientSettings.locale + 
            "&offset=" + offset + 
            "&order=first%2Clast" + 
            "&prefToken=" + encodeURIComponent(self.Contacts.prefToken) + 
            "&syncToken=" + encodeURIComponent(self.Contacts.syncToken);

        // console.log(requestUrl);
      
      request.get(requestUrl, {
        headers: fillDefaults({
          'Host': host,
          'Cookie': cookiesToStr(self.auth.cookies)
        }, self.clientSettings.defaultHeaders)
      }, function(err, response, body) {
        if (err) {
            console.log('Error fetching page of contacts');
          reject(err);
          return callback(err);
        }
        var result = JSON.parse(body);

        resolve(result);
      });
    });

  },
  __card(contacts, callback = function() { }, method) {
    var self = this;

    var requestPromise = new Promise(function(resolve, reject) {
      var content = {
        "contacts": contacts
      };

      content = JSON.stringify(content);
      if (!("syncToken" in self.Contacts)) {
        var errorObj = {
          error: 'No "syncToken" found! Please call "Contacts.list()" to initialize the Contacts services!',
          errorCode: 4
        };
        reject(errorObj);
        return callback(errorObj);
      }

      var host = getHostFromWebservice(self.account.webservices.contacts);
        request.post("https://" + host + "/co/contacts/card/" +
            "?clientBuildNumber=" + self.clientSettings.clientBuildNumber +
            "&clientId=" + self.clientId +
            "&clientMasteringNumber=" + self.clientSettings.clientMasteringNumber +
            "&clientVersion=2.1" +
            "&dsid=" + self.account.dsInfo.dsid +
            "&locale=en_US" +
            "&method=" + method +
            "&order=first%2Clast" +
            "&prefToken=" + self.Contacts.prefToken +
            "&syncToken=" + self.Contacts.syncToken, {
        headers: fillDefaults({
          'Host': host,
          'Cookie': cookiesToStr(self.auth.cookies),
          'Content-Length': content.length
		  }, self.clientSettings.defaultHeaders),
        body: content
      }, function(err, response, body) {
        if (err) {
          reject(err);
          return callback(err);
        }
        var result = JSON.parse(body);
            
        if ("errorCode" in result) {
          reject(body);
          return callback(body);
        }
            
        self.Contacts.syncToken = result.syncToken;
        self.Contacts.prefToken = result.prefToken;

        resolve(result);
        callback(null, result);
      });
    });

    return requestPromise;
  },
  change(contacts, callback = function() {}) {
    var self = this;
    if (!(contacts instanceof Array)) {
      contacts = [contacts];
    }
    return self.Contacts.__card(contacts, callback, "PUT");
  },
  new(contacts, callback = function() {}) {
    var self = this;
    if (!(contacts instanceof Array)) {
      contacts = [contacts];
    }
    contacts = contacts.map(function(contact) {
      if (!("contactId" in contact)) contact["contactId"] = newId();
      return contact;
    });
    return self.Contacts.__card(contacts, callback, "");
  },
  delete(contacts, callback = function() {}) {
    var self = this;
    if (!(contacts instanceof Array)) {
      contacts = [contacts];
    }
    contacts = contacts.map(function(contact) {
      return {
        contactId: contact.contactId,
        etag: contact.etag
      }
    });
    return self.Contacts.__card(contacts, callback, "DELETE");
  },

  __group(groups, callback = function () { }, method) {
    var self = this;

    var requestPromise = new Promise(function(resolve, reject) {
      var content = {
        "groups": groups
      };
      content = JSON.stringify(content);
      if (!("syncToken" in self.Contacts)) {
        var errorObj = {
          error: 'No "syncToken" found! Please call "Contacts.list()" to initialize the Contacts services!',
          errorCode: 4
        };
        reject(errorObj);
        return callback(errorObj);
      }

      var host = getHostFromWebservice(self.account.webservices.contacts);
        request.post("https://" + host + "/co/groups/card/" +
            "?clientBuildNumber=" + self.clientSettings.clientBuildNumber +
            "&clientId=" + self.clientId +
            "&clientMasteringNumber=" + self.clientSettings.clientMasteringNumber +
            "&clientVersion=2.1" +
            "&dsid=" + self.account.dsInfo.dsid +
            "&locale=en_US" +
            "&method=" + method +
            "&order=first%2Clast" +
            "&prefToken=" + self.Contacts.prefToken +
            "&syncToken=" + self.Contacts.syncToken, {
        headers: fillDefaults({
          'Host': host,
          'Cookie': cookiesToStr(self.auth.cookies),
          'Content-Length': content.length
		  }, self.clientSettings.defaultHeaders),
        body: content
      }, function(err, response, body) {
        if (err) {
          reject(err);
          return callback(err);
        }
        var result = JSON.parse(body);
            
        if ("errorCode" in result) {
          reject(body);
          return callback(body);
        }
          
        self.Contacts.syncToken = result.syncToken;
        self.Contacts.prefToken = result.prefToken;

        resolve(result);
        callback(null, result);
      });
    });

    return requestPromise;
  },

  newGroups(groups, callback = function () { }) {
    var self = this;
    if (!(groups instanceof Array)) {
      groups = [groups];
    }
    groups = groups.map(function(group) {
      if (!("groupId" in group)) group["groupId"] = newId();
      if (!("contactIds" in group)) group["contactIds"] = [];
      return group;
    });
    return self.Contacts.__group(groups, callback, "");
  },

  deleteGroups(groups, callback = function () { }) {
    var self = this;
    if (!(groups instanceof Array)) {
      groups = [groups];
    }
    return self.Contacts.__group(groups, callback, "DELETE");
  },

  changeGroups(groups, callback = function () { }) {
    var self = this;
    if (!(groups instanceof Array)) {
      groups = [groups];
    }
    return self.Contacts.__group(groups, callback, "PUT");
  }
}
