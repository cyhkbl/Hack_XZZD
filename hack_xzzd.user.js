// ==UserScript==
// @name         Hack XZZD
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  ZJU Course Video Auto Player - 自动观看浙大课程视频
// @author       GitHub Copilot
// @match        https://courses.zju.edu.cn/course/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    const CONFIG = {
        // 视频链接的选择器 (列表页)
        videoLinkSelector: 'a.title',
        
        // 视频页 URL 特征
        videoUrlKeyword: 'learning-activity',
        
        // 自动播放检测间隔 (毫秒)
        checkInterval: 2000,
        
        // 页面加载等待时间 (毫秒)
        pageLoadDelay: 3000,

        // 寻找视频元素的超时时间 (毫秒)
        findVideoTimeout: 15000
    };
    // ===========================================

    const STORAGE_KEY = 'hack_xzzd_state';

    // 获取当前状态
    function getState() {
        const state = localStorage.getItem(STORAGE_KEY);
        return state ? JSON.parse(state) : { 
            isRunning: false, 
            watchedList: [], 
            courseUrl: '',
            currentTargetId: '',
            playbackRate: 1.0 // 默认倍速
        };
    }

    // 保存状态
    function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // 主逻辑入口
    function main() {
        const currentUrl = window.location.href;
        console.log('[Hack XZZD] 当前 URL:', currentUrl);
        
        // 初始化 UI (所有页面都显示)
        setTimeout(initUI, 1000);

        // 1. 列表页逻辑
        if (currentUrl.includes('/content')) {
            handleListPage();
        } 
        // 2. 视频页逻辑
        else if (currentUrl.includes(CONFIG.videoUrlKeyword)) {
            handleVideoPage();
        }
    }

    // ================= UI 逻辑 =================
    function initUI() {
        if (document.getElementById('hack-xzzd-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'hack-xzzd-panel';
        panel.style.cssText = `
            position: fixed; 
            top: 100px; 
            right: 20px; 
            z-index: 9999; 
            padding: 15px; 
            background: rgba(0, 0, 0, 0.85); 
            color: #fff; 
            border-radius: 8px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            font-family: sans-serif;
            font-size: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 180px;
        `;

        // 标题
        const title = document.createElement('div');
        title.innerText = 'Hack XZZD 控制台';
        title.style.fontWeight = 'bold';
        title.style.textAlign = 'center';
        title.style.marginBottom = '5px';
        title.style.borderBottom = '1px solid #555';
        title.style.paddingBottom = '5px';
        panel.appendChild(title);

        // 开关按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'hack-xzzd-toggle-btn';
        toggleBtn.style.cssText = `
            padding: 8px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
            width: 100%;
        `;
        toggleBtn.onclick = toggleHack;
        panel.appendChild(toggleBtn);

        // 倍速控制
        const speedContainer = document.createElement('div');
        speedContainer.style.display = 'flex';
        speedContainer.style.alignItems = 'center';
        speedContainer.style.justifyContent = 'space-between';
        
        const speedLabel = document.createElement('label');
        speedLabel.innerText = '倍速: ';
        
        const speedInput = document.createElement('input');
        speedInput.type = 'number';
        speedInput.step = '0.1';
        speedInput.min = '0.5';
        speedInput.max = '16.0';
        speedInput.style.width = '60px';
        speedInput.style.padding = '4px';
        speedInput.style.borderRadius = '4px';
        speedInput.style.border = '1px solid #ccc';
        speedInput.style.color = '#000';
        speedInput.style.textAlign = 'center';
        
        const state = getState();
        speedInput.value = state.playbackRate;
        
        speedInput.onchange = function() {
            let val = parseFloat(this.value);
            if (isNaN(val)) val = 1.0;
            
            const s = getState();
            s.playbackRate = val;
            saveState(s);
            
            // 立即应用到当前视频
            const video = document.querySelector('video');
            if (video) video.playbackRate = val;
        };

        speedContainer.appendChild(speedLabel);
        speedContainer.appendChild(speedInput);
        panel.appendChild(speedContainer);

        document.body.appendChild(panel);
        
        updateUI();
    }

    function updateUI() {
        const state = getState();
        const btn = document.getElementById('hack-xzzd-toggle-btn');
        if (btn) {
            if (state.isRunning) {
                btn.innerText = '运行中 (点击停止)';
                btn.style.background = '#28a745'; // Green
                btn.style.color = '#fff';
            } else {
                btn.innerText = '已停止 (点击开始)';
                btn.style.background = '#dc3545'; // Red
                btn.style.color = '#fff';
            }
        }
    }

    function toggleHack() {
        const state = getState();
        state.isRunning = !state.isRunning;
        
        if (state.isRunning) {
            // 如果在列表页启动，记录 courseUrl
            if (window.location.href.includes('/content')) {
                state.courseUrl = window.location.href;
            }
            console.log('[Hack XZZD] 启动！');
        } else {
            console.log('[Hack XZZD] 停止。');
        }
        
        saveState(state);
        updateUI();

        if (state.isRunning) {
            // 根据当前页面触发逻辑
            if (window.location.href.includes('/content')) {
                findAndPlayNextVideo(state);
            } else if (window.location.href.includes(CONFIG.videoUrlKeyword)) {
                handleVideoPage();
            }
        }
    }

    // ================= 列表页逻辑 =================
    function handleListPage() {
        console.log('[Hack XZZD] 检测到列表页');
        
        // 自动寻找并播放
        setTimeout(() => {
            const state = getState();
            if (state.isRunning) {
                // 安全检查
                if (state.courseUrl && !window.location.href.includes(state.courseUrl.split('#')[0])) {
                     console.log('[Hack XZZD] 课程 URL 不匹配，停止运行');
                     state.isRunning = false;
                     saveState(state);
                     updateUI();
                     return;
                }
                findAndPlayNextVideo(state);
            }
        }, CONFIG.pageLoadDelay);
    }

    function findAndPlayNextVideo(state) {
        console.log('[Hack XZZD] 正在寻找下一个视频...');
        const links = Array.from(document.querySelectorAll(CONFIG.videoLinkSelector));
        
        if (links.length === 0) return;

        let nextVideo = null;
        let nextVideoId = null;
        
        for (let link of links) {
            let id = link.getAttribute('href');
            if (!id || id.trim() === '' || id.includes('javascript') || id === '#') {
                id = link.innerText.trim();
            }
            
            if (!state.watchedList.includes(id)) {
                nextVideo = link;
                nextVideoId = id;
                break;
            }
        }

        if (nextVideo) {
            console.log('[Hack XZZD] 找到下一个内容:', nextVideoId);
            nextVideo.style.border = "2px solid red";
            nextVideo.scrollIntoView({behavior: "smooth", block: "center"});
            
            state.currentTargetId = nextVideoId;
            saveState(state);

            setTimeout(() => {
                nextVideo.click();
            }, 1000);
        } else {
            alert('Hack XZZD: 所有内容已处理完毕！');
            state.isRunning = false;
            state.currentTargetId = '';
            saveState(state);
            updateUI();
        }
    }

    // ================= 视频页逻辑 =================
    let videoCheckTimer = null;

    function handleVideoPage() {
        // 清除旧的定时器，防止重复
        if (videoCheckTimer) clearInterval(videoCheckTimer);

        const state = getState();
        if (!state.isRunning) return;

        console.log('[Hack XZZD] 进入内容页处理');

        let foundVideo = false;
        const startTime = Date.now();

        videoCheckTimer = setInterval(() => {
            // 实时检查状态，如果用户中途停止，则不再操作
            const currentState = getState();
            if (!currentState.isRunning) {
                clearInterval(videoCheckTimer);
                return;
            }

            const video = document.querySelector('video');
            
            if (video) {
                foundVideo = true;
                clearInterval(videoCheckTimer);
                console.log('[Hack XZZD] 找到 video 元素');
                
                video.muted = true;
                video.playbackRate = currentState.playbackRate;
                
                // 优先模拟点击播放按钮，学在浙大需要通过点击事件来触发进度记录和心跳
                let playBtn = document.querySelector('.vjs-big-play-button') || document.querySelector('button[title="Play"]') || document.querySelector('.pv-playpause');
                if (!playBtn) {
                    const svgPath = document.querySelector('path[d^="M786.8 406.6"]');
                    if (svgPath) playBtn = svgPath.closest('svg') || svgPath;
                }

                if (playBtn) {
                    console.log('[Hack XZZD] 找到播放按钮，执行模拟点击...');
                    playBtn.click();
                    
                    // 延迟检查是否成功播放，作为兜底
                    setTimeout(() => {
                        if (video.paused) {
                            console.log('[Hack XZZD] 点击后视频仍暂停，尝试调用 video.play()');
                            video.play().catch(e => console.log(e));
                        }
                    }, 1000);
                } else {
                    console.log('[Hack XZZD] 未找到播放按钮，直接调用 video.play()');
                    video.play().catch(e => console.log(e));
                }

                video.onended = function() {
                    console.log('[Hack XZZD] 视频播放结束');
                    finishVideo(currentState);
                };
                
                // 备用进度检测
                setInterval(() => {
                    if (video.duration > 0 && video.currentTime >= video.duration - 1) {
                        if (!video.ended) finishVideo(currentState);
                    }
                }, 5000);
            }
            
            if (Date.now() - startTime > CONFIG.findVideoTimeout) {
                clearInterval(videoCheckTimer);
                if (!foundVideo) {
                    console.log('[Hack XZZD] 未找到视频，判定为非视频内容，跳过');
                    finishVideo(currentState);
                }
            }

        }, 1000);
    }

    function finishVideo(state) {
        const currentState = getState();
        const idToMark = currentState.currentTargetId || window.location.href;
        
        if (idToMark && !currentState.watchedList.includes(idToMark)) {
            currentState.watchedList.push(idToMark);
            currentState.currentTargetId = '';
            saveState(currentState);
            console.log(`[Hack XZZD] 已标记完成: ${idToMark}`);
        }

        // 侧边栏跳转逻辑
        console.log('[Hack XZZD] 尝试侧边栏跳转...');
        
        // 延时一点，确保页面状态稳定
        setTimeout(() => {
            const nextLink = findNextSidebarVideo();
            if (nextLink) {
                console.log('[Hack XZZD] 跳转下一个:', nextLink);
                nextLink.click();
            } else {
                console.log('[Hack XZZD] 未找到侧边栏下一个视频，尝试返回列表页');
                if (currentState.courseUrl) {
                    window.location.href = currentState.courseUrl;
                } else {
                    window.history.back();
                }
            }
        }, 1500);
    }

    function findNextSidebarVideo() {
        // 用户提供的特征: <span tipsy="activity.title" ng-bind="activity.title" ...>
        const selector = 'span[ng-bind="activity.title"]';
        const spans = Array.from(document.querySelectorAll(selector));
        
        if (spans.length === 0) return null;

        // 寻找当前激活的项
        // 1. 尝试通过 URL 匹配
        // 注意：Angular 路由通常是 #/xxx/xxx
        // window.location.href 可能是 http://.../#/xxx/xxx
        // 侧边栏链接 href 可能是 #/xxx/xxx
        
        const currentHash = window.location.hash; // e.g. #/course/123/learning-activity/456
        let currentIndex = -1;

        for (let i = 0; i < spans.length; i++) {
            const link = spans[i].closest('a');
            if (link) {
                const href = link.getAttribute('href');
                // 宽松匹配
                if (href && currentHash && href.includes(currentHash)) {
                    currentIndex = i;
                    break;
                }
                // 如果 href 是绝对路径
                if (link.href === window.location.href) {
                    currentIndex = i;
                    break;
                }
            }
        }

        // 2. 如果 URL 匹配失败，尝试查找 active class
        if (currentIndex === -1) {
            const activeEl = document.querySelector('.active ' + selector) || document.querySelector('.current ' + selector);
            if (activeEl) {
                currentIndex = spans.indexOf(activeEl);
            }
        }

        if (currentIndex !== -1 && currentIndex < spans.length - 1) {
            const nextSpan = spans[currentIndex + 1];
            return nextSpan.closest('a') || nextSpan;
        }
        
        return null;
    }

    // ================= 启动监听 =================
    let lastUrl = location.href; 
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            console.log('[Hack XZZD] URL 变化检测:', url);
            // URL 变化后，稍微等待页面渲染
            setTimeout(main, 1000);
        }
    }).observe(document, {subtree: true, childList: true});

    // 页面加载完成后执行
    window.addEventListener('load', main);
    
    // 针对某些加载特别慢的页面，或者 load 事件已经被触发的情况
    if (document.readyState === 'complete') {
        main();
    }

})();
