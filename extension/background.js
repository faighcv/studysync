chrome.action.onClicked.addListener(async (tab) => {
  // Tell the content script to scrape the current page
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {type: "SCRAPE_AND_PUSH"});
  } catch(e) {
    // No content script on this page
    await chrome.notifications.create({
      type: "basic", iconUrl: "icon128.png", title: "StudySync",
      message: "Open Assignments/Quizzes/Calendar (List) in Brightspace and click the icon again."
    });
  }
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg?.type !== "PUSH_ASSIGNMENTS") return;
  const st = await chrome.storage.sync.get(["apiBase","accessToken"]);
  if (!st.apiBase || !st.accessToken) {
    sendResponse({ok:false, error:"Please log in from Options"});
    return true;
  }
  try{
    const r = await fetch(`${st.apiBase}/assignments/bulk`, {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": `Bearer ${st.accessToken}`
      },
      body: JSON.stringify(msg.items)
    });
    if (!r.ok) throw new Error(await r.text());
    sendResponse({ok:true});
  }catch(e){
    sendResponse({ok:false, error: e.message});
  }
  return true;
});
