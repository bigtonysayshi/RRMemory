var NUM_STATUS_PER_PAGE = 20;
var STATUS_URL = 'http://status.renren.com/GetSomeomeDoingList.do';

function parseFriendsListResponse(responseData) {
	var cleanedDataStr = responseData.split('"data" : ')[1];
	cleanedDataStr = cleanedDataStr.substring(0, cleanedDataStr.lastIndexOf("}"));
	var dataJson = JSON.parse(cleanedDataStr);
	return dataJson['friends'];
}

function parseAlbumListResponse(responseData) {
	var regex = /'albumList':\s*(\[.*?\]),/g;
	var albumsRaw = responseData.match(regex)[0];
	albumsRaw = albumsRaw.split("'albumList': ")[1];
	albumsRaw = albumsRaw.substring(0, albumsRaw.lastIndexOf(","));
	try {
		var dataJson = JSON.parse(albumsRaw);
	} catch (err) {
		console.log("error parsing json");
	}
	return dataJson;
}

function parseAlbumResponse(responseData) {
	var regex = /"url":"(.*?)"/g;
	var imageListRaw = responseData.match(regex);
	if (imageListRaw == null) {
		// console.log("respData" + responseData);
		return [];
	}
	// console.log(imageListRaw);
	var imageUrlList = [];
	for (var i = 0; i < imageListRaw.length; i++) {
		var raw = imageListRaw[i];
		raw = raw.split('url":"')[1];
		raw = raw.split('"')[0];
		raw = raw.replace(/\\/g, "");
		imageUrlList.push(raw);
	}
	return imageUrlList;
}

function getAlbumListInfo(userId) {
	var albumListUrl = 'http://photo.renren.com/photo/' + userId + '/albumlist/v7';
	var data = $.ajax({
		url: albumListUrl,
		async: false
	}).responseText;

	var albumListJson = parseAlbumListResponse(data);
	// console.log(albumListJson);
	var albumCount = 0;
	var photoCount = 0;
	albumPhotoUrlDict = {};
	for (var i = 0; i < albumListJson.length; i++) {
		var album = albumListJson[i];
		if ((album['sourceControl'] == 0 || album['sourceControl'] == 99 || album['sourceControl'] == -1) && album['photoCount'] > 0) {
			albumCount += 1;
			photoCount += album['photoCount'];

			var albumUrl = 'http://photo.renren.com/photo/' + album['ownerId'] + '/' + 'album-' + album['albumId'] + '/v7';
			var albumResponseData = $.ajax({
				url: albumUrl,
				async: false
			}).responseText;
			var imageUrlList = parseAlbumResponse(albumResponseData);
			albumPhotoUrlDict[album['albumName']] = imageUrlList;
		}
	}
	return albumPhotoUrlDict;
}

function displayFriendsList() {
	chrome.storage.local.get(['friendsList'], function(data) {
		var friendsList = data.friendsList;
    	var friendsListStr = "Friends:\n";

    	for (var i = 0; i < friendsList.length; i++) {
    		var friendData = friendsList[i];
    		var albumData = friendData['albumInfo'];
    		var friendInfo = friendData['fname'] + "\n";
    		for (var albumName in albumData) {
    			friendInfo += albumName + "\n";
    			for (var idx in albumData[albumName]) {
    				friendInfo += decodeURI(albumData[albumName][idx]) + "\n";
    			}
    		}
    		friendsListStr += friendInfo;
    	}
		$('#friendsList').text(friendsListStr);
    })
}

function getPhotoData(photoUrl) {
	var xhr = new XMLHttpRequest();
    xhr.open("GET", photoUrl, false);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.send(null);
   return xhr.responseText;
}

function downloadAlbumPhotos(albumDir, photoUrls) {
	var xhr = new XMLHttpRequest();
	xhr.setRequestHeader('User-Agent',"XHR User-Agent Override");

	var downloadCount = 0;

	async.eachLimit(photoUrls, 10, function(photoUrl, callback) {
		var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
		try {
			var phtoData =  getPhotoDataAsync(xhr, photoUrl);
		    albumDir.file(photoName, phtoData, {binary:true});
		    downloadCount += 1;
		    console.log(downloadCount + " photos downloaded");
		} catch (err) {
			console.log(err.message);
		}
		callback();
	}, function(err) {
	    if (err) {
	    	console.log(err.message);
	    }
	});
}

function downloadPhotos() {
	chrome.storage.local.get(['friendsList'], function(data) {
		var zip = new JSZip();
		var rootDir = zip.folder("photos");

		var friendsList = data.friendsList;
		friendsList.forEach(function(friendData) {
			console.log("Start downloading user " + friendData['fname']);
			var friendDir = rootDir.folder(friendData['fname']);
			var albumData = friendData['albumInfo'];
			for (var albumName in albumData) {
				console.log("Start downloading album " + albumName);
				var albumDir = friendDir.folder(albumName);
				var photoUrls = albumData[albumName];

				// downloadAlbumPhotos(albumDir, photoUrls);

				var downloadCount = 0;
				albumData[albumName].forEach(function(photoUrl) {
					var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
					try {
				    	var phtoData =  getPhotoData(photoUrl);
					} catch (err) {
						console.log("getPhotoData error");
					}
				    albumDir.file(photoName, phtoData, {binary:true});
				    downloadCount += 1;
				    console.log(downloadCount + " photos downloaded");
				});
			}

		})
		
		zip.generateAsync({type: "blob"}).then(function(content) {
			saveAs(content, "memorytest.zip");
		});
    })
}

// function makeAjaxCall(url) {
// 	var xhr = new XMLHttpRequest();
//     xhr.open("GET", url, false);
//     xhr.overrideMimeType("text/plain; charset=x-user-defined");
//     xhr.send(null);
//    return xhr.responseText;
// }

function getStatusSummary(userId, page, callback) {
	$.ajax({
		url: STATUS_URL,
		data: {
			"userId": userId,
			"curpage": page,
		},
		dataType: "json",
		success: function(data) {
			console.log("Downloaded status page " + page);

			var summary = "";
			for (var idx in data["doingArray"]) {
				var statusItem = data["doingArray"][idx];
				// Skip reposts
				var rootUserId = statusItem["rootDoingUserId"];
				var invalidCode = statusItem["code"];
				if ((rootUserId && rootUserId != userId) || invalidCode) {
					continue;
				}
				var content = statusItem["content"];
				var cleanedContent = content.replace(/<[^>]*>/g, '');
				summary += cleanedContent + "\t" + statusItem["dtime"] + "\n";
			}
			callback(null, summary);
		}
	});
}

function getUserStatusDataAsync(userId, fileDir, callback) {
	console.log("start downloading status data");

	// compute the number of pages
	var firstPageData = $.ajax({
		url: STATUS_URL,
		data: {
			"userId": userId,
			"curpage": 0,
		},
		dataType: "json",
		async: false,
	});
	var totalStatusCount = firstPageData.responseJSON.count;
	var numPages = Math.ceil(totalStatusCount / NUM_STATUS_PER_PAGE);

	var statusSummary = "";

	async.map([...Array(numPages).keys()], function(page, callback) {
	    getStatusSummary(userId, page, function (err, res) {
	        if (err) {
	        	return callback(err);
	        }
	        callback(null, res);
	    })
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		for (var idx in results) {
			statusSummary += results[idx];
		}
		fileDir.file("status.txt", statusSummary);
		callback();
	});

}

function getBlogContent(userId, blogId) {
	var blogDetailUrl = 'http://blog.renren.com/blog/' + userId + '/' + blogId;
	var data = $.ajax({
		url: blogDetailUrl,
		async: false
	}).responseText;

	var blogContent = $('#blogContent', data);
	if (blogContent == null) {
		return null;
	}

	return blogContent[0].innerText.trim();

}

function getBlogPage(blogListUrl, userId, page, fileDir, callback) {
	$.ajax({
		url: blogListUrl,
		data: {
			"curpage": page,
		},
		dataType: "json",
		success: function(data) {
			console.log("Downloaded blog page " + page);

			console.log(data);
			for (var idx in data["data"]) {
				var blogItem = data["data"][idx];
				var blogId = blogItem["id"];
				var content = getBlogContent(userId, blogId);
				var createTime = blogItem["createTime"];
				var title = blogItem["title"];
				var summary = title + "\n" + createTime + "\n" + content + "\n";

				fileDir.file(title + ".txt", summary);
			}
			callback(null, summary);
		}
	});
}

function getUserBlogDataAsync(userId, fileDir, callback) {
	console.log("start downloading blog data");

	var blogListUrl = 'http://blog.renren.com/blog/' + userId + '/blogs';

	// compute the number of pages
	var firstPageData = $.ajax({
		url: blogListUrl,
		data: {
			"curpage": 0,
		},
		dataType: "json",
		async: false,
	});
	var totalBlogCount = firstPageData.responseJSON.count;
	var numPages = Math.ceil(totalBlogCount / NUM_STATUS_PER_PAGE);

	var statusSummary = "";

	async.map([...Array(numPages).keys()], function(page, callback) {
	    getBlogPage(blogListUrl, userId, page, fileDir, function (err, res) {
	        if (err) {
	        	return callback(err);
	        }
	        callback(null, res);
	    })
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		callback();
	});
}

function getPhotoDataAsync(photoUrl) {
	var xhr = new XMLHttpRequest();
    xhr.open("GET", photoUrl, false);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.send(null);
   return xhr.responseText;
}

function getAlbumDataAsync(albumName, photoUrls, fileDir, callback) {
	console.log("Start downloading album async" + albumName);
	var albumDir = fileDir.folder(albumName);

	var downloadCount = 0;

	async.map(photoUrls, function(photoUrl, callback) {
	    var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
		try {
	    	var phtoData =  getPhotoDataAsync(photoUrl);
	    	callback(null, [photoName, phtoData]);
		} catch (err) {
			console.log("getPhotoData error " + err);
			callback(null, null);
		}
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		results.forEach(function(res) {
			if (!res) {
				return;
			}
			var photoName = res[0];
			var photoData = res[1];
			console.log("photo name callback " + photoName);
			albumDir.file(photoName, photoData, {binary:true});
		});
		callback();
	});
}

function getUserPhotoDataAsync(userId, fileDir, callback) {
	var albumData = getAlbumListInfo(userId);

	// fetch tagged photos
	var taggedAlbumUrl = 'http://photo.renren.com/photo/' + userId + '/tag/v7';
	var taggedAlbumResponseData = $.ajax({
		url: taggedAlbumUrl,
		async: false
	}).responseText;
	var taggedPhotoUrls = parseAlbumResponse(taggedAlbumResponseData);
	albumData["Tagged"] = taggedPhotoUrls;

	async.mapSeries(Object.keys(albumData), function(albumName, callback) {
	    console.log("Start downloading album " + albumName);
		var photoUrls = albumData[albumName];

		getAlbumDataAsync(albumName, photoUrls, fileDir, callback);
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		console.log("map serires complete");
		callback();
	});
}

function getUserPhotoData(userId, fileDir) {
	var albumData = getAlbumListInfo(userId);
	for (var albumName in albumData) {
		console.log("Start downloading album " + albumName);
		var albumDir = fileDir.folder(albumName);
		var photoUrls = albumData[albumName];

		var downloadCount = 0;
		albumData[albumName].forEach(function(photoUrl) {
			var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
			try {
		    	var phtoData =  getPhotoData(photoUrl);
			} catch (err) {
				console.log("getPhotoData error");
			}
		    albumDir.file(photoName, phtoData, {binary:true});
		    downloadCount += 1;
		    console.log(downloadCount + " photos downloaded");
		});
	}

	// download tagged photos
	var taggedAlbumUrl = 'http://photo.renren.com/photo/' + userId + '/tag/v7';
	var taggedAlbumResponseData = $.ajax({
		url: taggedAlbumUrl,
		async: false
	}).responseText;
	var taggedPhotoUrls = parseAlbumResponse(taggedAlbumResponseData);

	var albumDir = fileDir.folder('Tagged');
	var downloadCount = 0;
	taggedPhotoUrls.forEach(function(photoUrl) {
		var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
		try {
	    	var phtoData =  getPhotoData(photoUrl);
		} catch (err) {
			console.log("getPhotoData error");
		}
	    albumDir.file(photoName, phtoData, {binary:true});
	    downloadCount += 1;
	    console.log(downloadCount + " photos downloaded");
	});
}

function downloadUserData(userId, userName) {
	var zip = new JSZip();
	var rootDir = zip.folder(userName + "_" + userId);

	var statusDir = rootDir.folder("Status");
	var blogDir = rootDir.folder("Blogs");
	var photoDir = rootDir.folder("Photos");

	async.parallel([
	    function(callback) {
			getUserStatusDataAsync(userId, statusDir, callback);
	    },
	    function(callback) {
			getUserBlogDataAsync(userId, blogDir, callback);
	    },
	    function(callback) {
	    	getUserPhotoDataAsync(userId, photoDir, callback);
	    }
	],
	function(err, results) {
    	// Save file
		zip.generateAsync({type: "blob"}).then(function(content) {
			saveAs(content, "memorytest.zip");
		});
	});
	
}

$(function() {
	chrome.tabs.query({active:true,currentWindow: true}, function(tabs) {
		var currentUrl = tabs[0].url;
		var userId = currentUrl.match(/\d/g).join("");
		var userName = tabs[0].title.split("-")[1].trim();
		$('#displayText').text("UserID: " + userId + "\nUserName: " + userName);

		$('#downloadButton').click(function() {
    		downloadUserData(userId, userName);
    	});

    	$('#getFriendsButton').click(function() {
    		getUserBlogDataAsync(userId, null);
    	});
    });
    
})
