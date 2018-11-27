var NUM_STATUS_PER_PAGE = 20;
var STATUS_URL = 'http://status.renren.com/GetSomeomeDoingList.do';


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
		return [];
	}
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
	$('#statusProgress').text("Scanning Status Data");
	console.log("start downloading status data");

	// compute the number of pages
	$.ajax({
		url: STATUS_URL,
		data: {
			"userId": userId,
			"curpage": 0,
		},
		dataType: "json",
		success: function(firstPageData) {
			console.log(firstPageData);
			var totalStatusCount = firstPageData.count;
			var numPages = Math.ceil(totalStatusCount / NUM_STATUS_PER_PAGE);

			var statusSummary = "";

			async.map([...Array(numPages).keys()], function(page, callback) {
			    getStatusSummary(userId, page, function (err, res) {
			        if (err) {
			        	return callback(err);
			        }
			        $('#statusProgress').text("Downloading Status Page " + page);
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
				$('#statusProgress').text("Finished Downloading Status Data");

				callback();
			});
		}
	});
}

function getBlogContent(userId, blogId, callback) {
	var blogDetailUrl = 'http://blog.renren.com/blog/' + userId + '/' + blogId;
	$.ajax({
		url: blogDetailUrl,
		success: function(data) {
			var blogContent = $('#blogContent', data);
			if (!blogContent || !blogContent[0]) {
				return callback(null, null);
			}
			callback(null, blogContent[0].innerText.trim());
		},
		error: function (jqXHR, status, err) {
        	console.log("get blog content error");
        	callback(err, null);
        }
	});
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
			async.map(data.data, function(blogData, callback) {
				console.log(blogData);
			    var blogItem = blogData;
				var blogId = blogItem.id;
				var createTime = blogItem.createTime;
				var title = blogItem.title;
				console.log("blogId " + blogId);

				getBlogContent(userId, blogId, function(err, res) {
					if (err) {
						console.log("get blog content error");
						callback();
						return;
					}
					var summary = title + "\n" + createTime + "\n" + res + "\n";
					fileDir.file(title + ".txt", summary);
					callback();
				});
			}, function(err, results) {
			    if (err) {
					console.log("error " + err);
				}
				$('#blogProgress').text("Finished Downloading Blog Page " + page);
				callback();
			});
		}
	});
}

function getUserBlogDataAsync(userId, fileDir, callback) {
	$('#blogProgress').text("Scanning Blog Data");
	console.log("start downloading blog data");

	var blogListUrl = 'http://blog.renren.com/blog/' + userId + '/blogs';

	// compute the number of pages
	$.ajax({
		url: blogListUrl,
		data: {
			"curpage": 0,
		},
		dataType: "json",
		success: function(firstPageData) {
			var totalBlogCount = firstPageData.count;
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
				$('#blogProgress').text("Finished Downloading Blog Data");
				callback();
			});
		}
	});
}

function getPhotoDataAsync(photoUrl, callback) {
	$.ajax({
		url: photoUrl,
		dataType:"binary",
		xhr:function() {
            var xhr = new XMLHttpRequest();
            xhr.responseType= 'blob'
            return xhr;
        },
        success: function(data) {
            callback(null, data);
        },
        error: function (jqXHR, status, err) {
        	console.log("async download photo error");
        	callback(err, null);
        }
	});
}

function getAlbumDataAsync(albumName, photoUrls, fileDir, callback) {
	console.log("Start downloading album async" + albumName);
	var albumDir = fileDir.folder(albumName);

	var downloadCount = 0;

	async.map(photoUrls, function(photoUrl, callback) {
	    var photoName = photoUrl.substring(photoUrl.lastIndexOf("/") + 1, photoUrl.length);
	    getPhotoDataAsync(photoUrl, function(err, res) {
    		if (err) {
    			console.log("getPhotoData error " + err);
    			callback(err, null);
    		}
    		callback(null, [photoName, res]);
    	});
	}, function(err, results) {
		console.log("data map finish");
	    if (err) {
			console.log("error " + err);
		}
		results.forEach(function(res) {
			if (!res) {
				return;
			}
			var photoName = res[0];
			var photoData = res[1];
			albumDir.file(photoName, photoData, {binary:true});
		});
		callback();
	});
}

function getUserPhotoDataAsync(userId, fileDir, callback) {
	$('#photoProgress').text("Scanning Photo Data");

	var albumData = getAlbumListInfo(userId);

	// fetch tagged photos
	var taggedAlbumUrl = 'http://photo.renren.com/photo/' + userId + '/tag/v7';
	var taggedAlbumResponseData = $.ajax({
		url: taggedAlbumUrl,
		async: false
	}).responseText;
	var taggedPhotoUrls = parseAlbumResponse(taggedAlbumResponseData);
	albumData["Tagged"] = taggedPhotoUrls;

	var numAlbums = Object.keys(albumData).length;
	var downloadedAlbums = 0;
	$('#photoProgress').text("Downloding Photo Data " + downloadedAlbums + "/" + numAlbums);
	async.mapSeries(Object.keys(albumData), function(albumName, callback) {
	    console.log("Start downloading album " + albumName);
		var photoUrls = albumData[albumName];

		getAlbumDataAsync(albumName, photoUrls, fileDir, callback);
		downloadedAlbums += 1;
		$('#photoProgress').text("Downloding Photo Data " + downloadedAlbums + "/" + numAlbums);
	}, function(err, results) {
	    if (err) {
			console.log("error " + err);
		}
		$('#photoProgress').text("Finished Downloading Photo Data");
		callback();
	});
}

function downloadUserData(userId, userName) {
	var zip = new JSZip();
	var rootDir = zip.folder(userName + "_" + userId);

	var statusDir = rootDir.folder("Status");
	var blogDir = rootDir.folder("Blogs");
	var photoDir = rootDir.folder("Photos");

	async.series([
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
