console.log("eventPage head");
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("show page action 0");
    if (request.todo == "showPageAction") {
    	console.log("show page action");
        chrome.tabs.query({active:true,currentWindow: true}, function(tabs) {
            chrome.pageAction.show(tabs[0].id);
            console.log(tabs[0].url);
        });
    }
});
