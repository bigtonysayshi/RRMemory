
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
		console.log("respData" + responseData);
		return [];
	}
	console.log(imageListRaw);
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
	console.log(albumListJson);
	var albumCount = 0;
	var photoCount = 0;
	albumPhotoUrlDict = {};
	for (var i = 0; i < albumListJson.length; i++) {
		var album = albumListJson[i];
		if ((album['sourceControl'] == 0 || album['sourceControl'] == 99) && album['photoCount'] > 0) {
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

function getAlbumPhotoUrls(albumUrl) {
	$.get(albumUrl, function(data, status) {
		var imageUrlList = parseAlbumResponse(data);	
	})
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

$(function() {
	chrome.tabs.query({active:true,currentWindow: true}, function(tabs) {
		var currentUrl = tabs[0].url;
		var userId = currentUrl.match(/\d/g).join("");
		$('#displayText').text("UserID:" + userId);
    });

	displayFriendsList();

    $('#getFriendsButton').click(function() {
    	var getFriendsListRequestUrl = 'http://friend.renren.com/groupsdata';
    	$.get(getFriendsListRequestUrl, function(data, status) {

    		// TODO: remove the slice to enable for all users
	    	var friendsList = parseFriendsListResponse(data).slice(0,2);

	    	for (var i = 0; i < friendsList.length; i++) {
	    		var friendId = friendsList[i]['fid'];
	    		var albumListInfo = getAlbumListInfo(friendId);
	    		friendsList[i]['albumInfo'] = albumListInfo;
	    	}
	    	chrome.storage.local.set({'friendsList': friendsList}, function() {
	    		console.log('friends list set to storage');
	    		displayFriendsList();
	    	});
    	})
    })
})
