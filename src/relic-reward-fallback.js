// AlecaFrame-ZH：遗物奖励中文回退辅助代码
// 由启动器在 OCR 开启时注入官方 web/assets/js/relicOverlay/main.js
// 来源：MIOEU/AlecaFrame-ZH（MIT），经 AlecaFrame-ZH 适配
// ALECAFRAME_ZH_CN_REWARD_FALLBACK
var alecaFrameZhCnRewardResultKey = "__alecaframeZhCnRewardOverlayResult";
var alecaFrameZhCnRewardResultEndpoint = "http://127.0.0.1:38147/latest-reward";
var alecaFrameZhCnRewardCaptureEndpoint = "http://127.0.0.1:38147/capture-reward";
var alecaFrameZhCnRewardFallbackInProgress = false;
var alecaFrameZhCnRewardFallbackCompleted = false;
function alecaFrameZhCnRewardDisplayName(englishName) {
    try {
        var translations = window.__ALECAFRAME_ZH_CN_ITEMS__ || {};
        var chineseName = translations[englishName];
        return chineseName && chineseName !== englishName ? chineseName + "\n" + englishName : englishName;
    } catch (e) {
        return englishName;
    }
}
function alecaFrameZhCnRewardItem(name) {
    return {
        name: alecaFrameZhCnRewardDisplayName(name), platinum: -1, ducats: -1,
        isItemVaulted: false, isFav: false, isPartOfOwned: false,
        countOwned: "-", totalToOwn: "-", componentData: [], setPlat: -1, detected: true
    };
}
function alecaFrameZhCnRewardRead(startedAt, done) {
    try {
        var cached = JSON.parse(localStorage.getItem(alecaFrameZhCnRewardResultKey) || "");
        if (cached && Array.isArray(cached.rewards) && cached.rewards.length &&
            cached.updatedAt >= startedAt - 15000 && Date.now() - cached.updatedAt < 30000) {
            done(cached.rewards);
            return;
        }
    } catch (e) { }
    fetch(alecaFrameZhCnRewardResultEndpoint).then(function (response) {
        return response.ok ? response.json() : null;
    }).then(function (payload) {
        if (payload && Array.isArray(payload.rewards) && payload.rewards.length &&
            payload.updatedAt >= startedAt - 15000) {
            done(payload.rewards);
        }
    }).catch(function () { });
}
function alecaFrameZhCnRewardApplyPrices(names) {
    try {
        var nativePlugin = window.plugin && window.plugin.get && window.plugin.get();
        if (!nativePlugin || typeof nativePlugin.getHugePriceList !== "function") return;
        nativePlugin.getHugePriceList(JSON.stringify(names), function (success, data) {
            if (!success) return;
            try {
                var prices = JSON.parse(data);
                relicsApp.relics = relicsApp.relics.map(function (relic, index) {
                    var price = prices[index] && prices[index].post;
                    if (Number.isFinite(Number(price))) relic.platinum = Number(price);
                    return relic;
                });
            } catch (e) { }
        });
    } catch (e) { }
}
function alecaFrameZhCnRequestRewardCapture() {
    // Ask the background page for its native Overwolf game-window capture.
    // The fallback keeps compatibility only if the background bridge is not
    // yet available during application startup.
    try {
        var mainWindow = overwolf.windows.getMainWindow();
        var background = mainWindow && mainWindow.window ? mainWindow.window : mainWindow;
        if (background && typeof background.__ALECAFRAME_ZH_CN_CAPTURE_REWARD__ === "function") {
            background.__ALECAFRAME_ZH_CN_CAPTURE_REWARD__();
            return;
        }
        fetch(alecaFrameZhCnRewardCaptureEndpoint, { method: "POST" }).catch(function () { });
    } catch (e) {
        try {
            fetch(alecaFrameZhCnRewardCaptureEndpoint, { method: "POST" }).catch(function () { });
        } catch (ignored) { }
    }
}
function alecaFrameZhCnStartRewardFallback() {
    if (alecaFrameZhCnRewardFallbackInProgress || alecaFrameZhCnRewardFallbackCompleted) return;
    alecaFrameZhCnRewardFallbackInProgress = true;
    var fallbackStartedAt = Date.now();
    var attempts = 0;
    var completed = false;
    relicsApp.loading = true;
    relicsApp.error = false;
    alecaFrameZhCnRequestRewardCapture();
    var timer = setInterval(function () {
        attempts += 1;
        alecaFrameZhCnRewardRead(fallbackStartedAt, function (names) {
            if (completed) return;
            completed = true;
            alecaFrameZhCnRewardFallbackCompleted = true;
            alecaFrameZhCnRewardFallbackInProgress = false;
            clearInterval(timer);
            relicsApp.relics = names.map(alecaFrameZhCnRewardItem);
            relicsApp.globalData = { platinum: -1, ducats: -1 };
            relicsApp.error = false;
            relicsApp.errorMessage = "";
            relicsApp.loading = false;
            alecaFrameZhCnRewardApplyPrices(names);
            console.log("[AlecaFrame ZH] Chinese reward fallback applied: " + names.join(" | "));
        });
        if (attempts >= 35 && !completed) {
            clearInterval(timer);
            alecaFrameZhCnRewardFallbackInProgress = false;
            relicsApp.loading = false;
            relicsApp.error = true;
            relicsApp.errorMessage = "Unsupported Warframe language detected. Chinese OCR did not return a current reward result.";
        }
    }, 100);
}