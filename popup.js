

function parseFriendsListResponse(responseData) {
	var cleanedDataStr = responseData.split('"data" : ')[1];
	cleanedDataStr = cleanedDataStr.substring(0, cleanedDataStr.lastIndexOf("}"));
	var dataJson = JSON.parse(cleanedDataStr);
	return dataJson['friends'];
}

function parseAlbumListResponse(responseData) {
	var regex = /'albumList':\s*(\[.*?\]),/g;
	var albums_raw = responseData.match(regex)[0];
	albums_raw = albums_raw.split("'albumList': ")[1];
	albums_raw = albums_raw.substring(0, albums_raw.lastIndexOf(","));
	try {
		var dataJson = JSON.parse(albums_raw);
	} catch (err) {
		console.log("error parsing json");
	}
	return dataJson;
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
	var i;
	for (i = 0; i < albumListJson.length; i++) {
		var album = albumListJson[i];
		if (album['sourceControl'] == 0 || album['sourceControl'] == 99) {
			console.log('in source');
			albumCount += 1;
			photoCount += album['photoCount'];
		}
		// console.log(album['albumId'] + ' ' + album['albumName'] + ' ' + album['sourceControl'] + ' ' + album['photoCount']);
	}
	return `Albums: ${albumCount} Photos: ${photoCount}`;

	// $.get(albumListUrl, function(data, status) {
	// 	var albumListJson = parseAlbumListResponse(data);

	// 	var albumCount = 0;
	// 	var photoCount = 0;
	// 	var i;
	// 	for (i = 0; i < albumListJson.length; i++) {
	// 		var album = albumListJson[i];
	// 		if (album['sourceControl'] == 0 || album['sourceControl'] == 99) {
	// 			console.log('in source');
	// 			albumCount += 1;
	// 			photoCount += album['photoCount'];
	// 		}
	// 		// console.log(album['albumId'] + ' ' + album['albumName'] + ' ' + album['sourceControl'] + ' ' + album['photoCount']);
	// 	}
	// 	var storeKey = `userInfo_${userId}`;
	// 	var storeVal = `Albums: ${albumCount} Photos: ${photoCount}`;

	// 	chrome.storage.local.set({storeKey: storeVal}, function() {
	// 		console.log(`stored ${storeKey} ${storeVal}`);
 //    	});
	// })
}

function displayFriendsList() {
	chrome.storage.local.get(['friendsList'], function(data) {
		var friendsList = data.friendsList;
    	var friendsListStr = "Friends:\n";

    	var i = 0;
    	for (i = 0; i < friendsList.length; i++) {
    		var friendData = friendsList[i];
    		console.log(friendData);
    		var friendInfo = friendData['fname'] + ": " + friendData['albumInfo'] + "\n";
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
	    	var friendsList = parseFriendsListResponse(data).slice(0,5);

	    	for (var i = 0; i < friendsList.length; i++) {
	    		var albumListInfo = getAlbumListInfo(friendsList[i]['fid']);
	    		friendsList[i]['albumInfo'] = albumListInfo;
	    	}
	    	chrome.storage.local.set({'friendsList': friendsList}, function() {
	    		console.log('friends list set to storage');
	    		displayFriendsList();
	    	});
    	})
    })
})
