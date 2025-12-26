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
        // 视频链接的选择器
        // 根据用户反馈，链接可能是 <a class="title ...">
        videoLinkSelector: 'a.title',
        
        // 视频页 URL 特征：用于判断是否处于视频播放页
        // 如果脚本无法识别视频页，请检查视频页 URL
        videoUrlKeyword: 'learning-activity',
        
        // 自动播放检测间隔 (毫秒)
        checkInterval: 2000,
        
        // 视频播放倍速 (建议不要太快，以免被检测)
        playbackRate: 1.0,
        
        // 页面加载等待时间 (毫秒)，用于等待 DOM 渲染
        pageLoadDelay: 3000,

        // 寻找视频元素的超时时间 (毫秒)
        // 如果进入页面后这么久还没找到 video 标签，说明可能不是视频（如文档），则跳过
        findVideoTimeout: 15000
    };
    // ===========================================

    const STORAGE_KEY = 'hack_xzzd_state';

    // 获取当前状态
    function getState() {
        const state = localStorage.getItem(STORAGE_KEY);
        // 默认状态
        return state ? JSON.parse(state) : { 
            isRunning: false, 
            watchedList: [], 
            courseUrl: '',
            currentTargetId: '' // 记录当前正在点击/观看的视频标识
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
        
        // 1. 判断是否在课程内容列表页
        // 模式: https://courses.zju.edu.cn/course/xxxxx/content#/
        if (currentUrl.includes('/content')) {
            handleListPage();
        } 
        // 2. 判断是否在视频播放页
        // 假设视频页 URL 包含 learning-activity
        else if (currentUrl.includes(CONFIG.videoUrlKeyword)) {
            handleVideoPage();
        }
    }

    // ================= 列表页逻辑 =================
    function handleListPage() {
        console.log('[Hack XZZD] 检测到列表页');
        
        // 1. 注入控制按钮
        // 使用 setTimeout 等待页面元素加载
        setTimeout(() => {
            // 防止重复添加
            if (document.getElementById('hack-xzzd-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'hack-xzzd-btn';
            btn.innerText = 'Hack XZZD';
            // 样式设置：右上角悬浮
            btn.style.cssText = `
                position: fixed; 
                top: 100px; 
                right: 20px; 
                z-index: 9999; 
                padding: 10px 20px; 
                background: #f00; 
                color: #fff; 
                border: none; 
                border-radius: 5px; 
                cursor: pointer; 
                font-weight: bold;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            `;
            btn.onclick = toggleHack;
            document.body.appendChild(btn);
            
            // 根据当前状态更新按钮样式
            const state = getState();
            updateButtonState(btn, state.isRunning);
            
        }, CONFIG.pageLoadDelay);

        // 2. 如果处于运行状态，自动寻找并播放下一个视频
        setTimeout(() => {
            const state = getState();
            if (state.isRunning) {
                // 简单的安全检查：确保我们还在同一个课程里（通过 URL 前缀判断）
                // 如果 state.courseUrl 存在，且当前 URL 不包含其基础部分，可能跳到了其他课
                if (state.courseUrl && !window.location.href.includes(state.courseUrl.split('#')[0])) {
                     console.log('[Hack XZZD] 课程 URL 不匹配，停止运行');
                     state.isRunning = false;
                     saveState(state);
                     updateButtonState(document.getElementById('hack-xzzd-btn'), false);
                     return;
                }

                findAndPlayNextVideo(state);
            }
        }, CONFIG.pageLoadDelay + 1500); // 稍微晚一点执行，确保 DOM 完全就绪
    }

    // 切换运行状态
    function toggleHack() {
        const state = getState();
        state.isRunning = !state.isRunning; // 切换状态
        
        if (state.isRunning) {
            // 开始运行：记录当前列表页 URL
            state.courseUrl = window.location.href;
            // 注意：这里不清除 watchedList，以便支持断点续看。
            // 如果想重置，可以在这里 state.watchedList = [];
            console.log('[Hack XZZD] 启动！');
        } else {
            console.log('[Hack XZZD] 停止。');
        }
        
        saveState(state);
        updateButtonState(document.getElementById('hack-xzzd-btn'), state.isRunning);

        if (state.isRunning) {
            findAndPlayNextVideo(state);
        }
    }

    // 更新按钮外观
    function updateButtonState(btn, isRunning) {
        if (!btn) return;
        if (isRunning) {
            btn.innerText = 'Hack XZZD (运行中...)';
            btn.style.background = '#0a0'; // 绿色
        } else {
            btn.innerText = 'Hack XZZD (点击开始)';
            btn.style.background = '#f00'; // 红色
        }
    }

    // 寻找下一个视频
    function findAndPlayNextVideo(state) {
        console.log('[Hack XZZD] 正在寻找下一个视频...');
        
        // 获取所有可能的视频链接
        const links = Array.from(document.querySelectorAll(CONFIG.videoLinkSelector));
        
        console.log(`[Hack XZZD] 找到 ${links.length} 个潜在内容链接`);

        if (links.length === 0) {
            console.log('[Hack XZZD] 未找到内容链接，请检查 CONFIG.videoLinkSelector 或页面加载情况');
            return;
        }

        let nextVideo = null;
        let nextVideoId = null;
        
        for (let link of links) {
            // 提取唯一标识
            // 优先使用 href，如果 href 无效（如 javascript:void），则使用 innerText
            let id = link.getAttribute('href');
            if (!id || id.trim() === '' || id.includes('javascript') || id === '#') {
                id = link.innerText.trim();
            }
            
            // 如果不在已观看列表中
            if (!state.watchedList.includes(id)) {
                nextVideo = link;
                nextVideoId = id;
                break;
            }
        }

        if (nextVideo) {
            console.log('[Hack XZZD] 找到下一个内容，准备跳转:', nextVideoId);
            // 视觉提示
            nextVideo.style.border = "2px solid red";
            nextVideo.scrollIntoView({behavior: "smooth", block: "center"});
            
            // 记录当前目标 ID，以便在视频页完成后标记
            state.currentTargetId = nextVideoId;
            saveState(state);

            // 延时跳转，让用户看清
            setTimeout(() => {
                nextVideo.click();
            }, 1000);
        } else {
            alert('Hack XZZD: 所有内容已处理完毕！');
            state.isRunning = false;
            state.currentTargetId = '';
            saveState(state);
            updateButtonState(document.getElementById('hack-xzzd-btn'), false);
        }
    }

    // ================= 视频页逻辑 =================
    function handleVideoPage() {
        const state = getState();
        // 如果没有开启 Hack 模式，不进行自动操作
        if (!state.isRunning) return;

        console.log('[Hack XZZD] 进入内容页，准备处理');

        let foundVideo = false;
        const startTime = Date.now();

        // 轮询查找 video 元素
        const checkVideoTimer = setInterval(() => {
            const video = document.querySelector('video');
            
            // 1. 找到视频，开始播放逻辑
            if (video) {
                foundVideo = true;
                clearInterval(checkVideoTimer);
                console.log('[Hack XZZD] 找到 video 元素');
                
                // 静音 & 倍速
                video.muted = true;
                video.playbackRate = CONFIG.playbackRate;
                
                // 播放
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(_ => {
                        console.log('[Hack XZZD] 开始播放');
                    }).catch(error => {
                        console.log('[Hack XZZD] 自动播放失败，尝试模拟点击', error);
                        
                        // 1. 尝试常规播放按钮
                        let playBtn = document.querySelector('.vjs-big-play-button') || document.querySelector('button[title="Play"]');
                        
                        // 2. 尝试用户反馈的 SVG 播放按钮
                        if (!playBtn) {
                            // 匹配 d 属性前缀
                            const svgPath = document.querySelector('path[d^="M786.8 406.6"]');
                            if (svgPath) {
                                // 优先点击 SVG 元素，如果不行点击 path
                                playBtn = svgPath.closest('svg') || svgPath;
                            }
                        }

                        if (playBtn) {
                            console.log('[Hack XZZD] 点击播放按钮:', playBtn);
                            playBtn.click();
                            // 双重保险：点击父元素（很多时候点击事件绑定在容器上）
                            if (playBtn.parentElement) playBtn.parentElement.click();
                        }
                    });
                }

                // 监听结束
                video.onended = function() {
                    console.log('[Hack XZZD] 视频播放结束');
                    finishVideo(state);
                };
                
                // 备用进度检测
                setInterval(() => {
                    if (video.duration > 0 && video.currentTime >= video.duration - 1) {
                        if (!video.ended) finishVideo(state);
                    }
                }, 5000);
            }
            
            // 2. 超时检测：如果长时间没找到视频，可能是文档或作业，直接跳过
            if (Date.now() - startTime > CONFIG.findVideoTimeout) {
                clearInterval(checkVideoTimer);
                if (!foundVideo) {
                    console.log('[Hack XZZD] 未找到视频元素，判定为非视频内容，标记为已完成并返回');
                    finishVideo(state);
                }
            }

        }, 1000);
    }

    // 视频完成后的处理
    function finishVideo(state) {
        // 重新读取状态
        const currentState = getState();
        
        // 优先使用之前保存的 currentTargetId
        // 如果没有（比如手动进入视频页），则尝试使用当前 URL
        const idToMark = currentState.currentTargetId || window.location.href;
        
        if (idToMark && !currentState.watchedList.includes(idToMark)) {
            currentState.watchedList.push(idToMark);
            // 清除当前目标
            currentState.currentTargetId = '';
            saveState(currentState);
            console.log(`[Hack XZZD] 已标记为完成: ${idToMark}`);
        }

        console.log('[Hack XZZD] 准备返回列表页:', currentState.courseUrl);
        
        // 延时一小会儿跳转
        setTimeout(() => {
            if (currentState.courseUrl) {
                window.location.href = currentState.courseUrl;
            } else {
                window.history.back();
            }
        }, 1000);
    }

    // ================= 启动监听 =================
    
    // 监听 URL 变化 (针对 SPA 单页应用)
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
