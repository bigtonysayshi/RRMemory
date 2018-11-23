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

async function getPhotoDataAsync(xhr, photoUrl) {
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

function testGetUserStatusDataAsync(userId, fileDir) {
	console.log("start downloading status data");

	var statusSummary = "";

	async.map([0, 1, 2, 4, 5, 6, 7], function(page, callback) {
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
		console.log("map done");
		console.log(results.length);
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
	console.log(firstPageData.responseJSON);
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
		console.log("map done");
		console.log(results.length);
		fileDir.file("status.txt", statusSummary);
		callback();
	});

}

function getUserStatusData(userId, fileDir) {
	console.log("start downloading status data");

	// $('#statusProgress').text("Scanning Status");

	var statusSummary = "";

	var page = 0;
	while (page >= 0) {
		console.log("Downloading status page " + page);

		var data = $.ajax({
			url: STATUS_URL,
			data: {
				"userId": userId,
				"curpage": page,
			},
			// async: false
		}).responseText;
		$('#statusProgress').text("Scanning Status Page " + page);
		var parsedData = JSON.parse(data);

		// exit while loop if no more item
		if (parsedData["doingArray"].length == 0) {
			page = -1;
			break;
		}

		for (var idx in parsedData["doingArray"]) {
			var statusItem = parsedData["doingArray"][idx];
			// Skip reposts
			var rootUserId = statusItem["rootDoingUserId"];
			var invalidCode = statusItem["code"];
			if ((rootUserId && rootUserId != userId) || invalidCode) {
				continue;
			}
			var content = statusItem["content"];
			var cleanedContent = content.replace(/<[^>]*>/g, '');
			var summary = cleanedContent + "\t" + statusItem["dtime"] + "\n";
			statusSummary += summary;
		}

		page += 1;
	}
	fileDir.file("status.txt", statusSummary);

	// $('#statusProgress').text("Complete Scanning Status");
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

function getUserBlogData(userId, fileDir) {
	console.log("start downloading blog data");
	// $('#statusProgress').text("Scanning Blogs");

	var blogListUrl = 'http://blog.renren.com/blog/' + userId + '/blogs';

	var page = 0;
	while (page >= 0) {
		console.log("Downloading blog page " + page);
		var data = $.ajax({
			url: blogListUrl,
			data: {
				"curpage": page,
			},
			async: false
		}).responseText;

		var parsedData = JSON.parse(data);
		if (parsedData["data"].length == 0) {
			page = -1;
			break;
		}

		for (var idx in parsedData["data"]) {
			var blogItem = parsedData["data"][idx];
			var blogId = blogItem["id"];
			var content = getBlogContent(userId, blogId);
			var createTime = blogItem["createTime"];
			var title = blogItem["title"];
			var summary = title + "\n" + createTime + "\n" + content + "\n";

			fileDir.file(title + ".txt", summary);

			// console.log(summary);
		}

		page += 1;
	}

	// $('#statusProgress').text("Complete Scanning Blogs");
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

	async.parallel([
	    function(callback) {
			getUserStatusDataAsync(userId, statusDir, callback);
	    },

	  //   function(callback) {
			// getUserBlogData(userId, blogDir);
	  //   }
	],
	// optional callback
	function(err, results) {
    	// Save file
		zip.generateAsync({type: "blob"}).then(function(content) {
			saveAs(content, "memorytest.zip");
		});
	});

	// Status
	// setTimeout(function() {
	// 	$('#statusProgress').text("Scanning Status");
	//  	var statusDir = rootDir.folder("Status");
	// 	getUserStatusData(userId, statusDir);
	// 	$('#statusProgress').text("Finished Scanning Status");
	// }, 0);

	// asyncWrapper(getUserStatusData(userId, statusDir), function() {
	// 	console.log("getUserStatusData Finished");
	// })

	// Blogs
	// setTimeout(function() {
	// 	$('#blogProgress').text("Scanning Blogs");
	// 	var blogDir = rootDir.folder("Blogs");
	// 	getUserBlogData(userId, blogDir);
	// 	$('#blogProgress').text("Finished Scanning Blogs");
	// }, 0);

	// asyncWrapper(getUserBlogData(userId, blogDir), function() {
	// 	console.log("getUserBlogData Finished");
	// })

	// Photos
	// setTimeout(function() {
	// 	$('#photoProgress').text("Scanning Photos");
	// 	var photoDir = rootDir.folder("Photos");
	// 	getUserPhotoData(userId, photoDir);
	// 	$('#photoProgress').text("Finished Scanning Photos");
	// }, 0);
	

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
    		testGetUserStatusDataAsync(userId, null);
    	});
    });
    
})
