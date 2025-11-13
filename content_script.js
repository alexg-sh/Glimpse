(() => {
    let ui = null;
    let conversationHistory = [];
    let isRequestInProgress = false;
    let abortController = null;
    let isChatMode = false;
    let pageContext = null; // Store page context once
    // Toggle functions will be defined when UI is created
    let switchToFindMode;
    let switchToChatMode;
    
    // Settings storage
    let settings = {
        apiKey: "",
        model: "openai/gpt-4o-mini",
        modelsCache: null,
        modelsCacheTime: null
    };

    // Chrome Storage API functions
    const loadSettings = async () => {
        try {
            const result = await chrome.storage.local.get(["apiKey", "model", "modelsCache", "modelsCacheTime"]);
            if (result.apiKey !== undefined) settings.apiKey = result.apiKey;
            if (result.model !== undefined) settings.model = result.model;
            if (result.modelsCache !== undefined) settings.modelsCache = result.modelsCache;
            if (result.modelsCacheTime !== undefined) settings.modelsCacheTime = result.modelsCacheTime;
        } catch (error) {
            console.error("Error loading settings:", error);
        }
    };

    const saveSettings = async () => {
        try {
            await chrome.storage.local.set({
                apiKey: settings.apiKey,
                model: settings.model,
                modelsCache: settings.modelsCache,
                modelsCacheTime: settings.modelsCacheTime
            });
        } catch (error) {
            console.error("Error saving settings:", error);
        }
    };

    // Fetch models from OpenRouter API
    const fetchModels = async (forceRefresh = false) => {
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        
        // Check cache first
        if (!forceRefresh && settings.modelsCache && settings.modelsCacheTime) {
            const cacheAge = Date.now() - settings.modelsCacheTime;
            if (cacheAge < CACHE_DURATION) {
                return settings.modelsCache;
            }
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            const models = data.data || [];
            
            // Cache the models
            settings.modelsCache = models;
            settings.modelsCacheTime = Date.now();
            await saveSettings();
            
            return models;
        } catch (error) {
            console.error("Error fetching models:", error);
            // Return fallback models if API call fails
            return [
                { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
                { id: "openai/gpt-4o", name: "GPT-4o" },
                { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
                { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
                { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5" },
                { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
                { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" }
            ];
        }
    };

    // Enhanced Markdown parser
    const parseMarkdown = (text) => {
        let formattedText = text;

        const escapeHtml = (unsafe, allowHtml = false) => {
            if (allowHtml) return unsafe;
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Handle metadata block first
        const metadataRegex = /^Page Title:.*?\nURL:.*?\nPercentage of content sent:.*?\n\n/s;
        const metadataMatch = formattedText.match(metadataRegex);
        if (metadataMatch) {
            const metadata = metadataMatch[0];
            formattedText = formattedText.replace(metadataRegex, '');
            formattedText = `<pre>${escapeHtml(metadata.trim())}</pre>\n\n` + formattedText;
        }

        // Handle horizontal rules
        formattedText = formattedText.replace(/^---+$/gm, "<hr>");

        // Handle code blocks before other processing
        formattedText = formattedText.replace(
            /^```(\w*)\n([\s\S]*?)\n```$/gm,
            (match, lang, code) => `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`
        );

        // Handle inline code before other text formatting
        formattedText = formattedText.replace(/`([^`\n]+)`/g, (match, code) => `<code>${escapeHtml(code)}</code>`);

        // Handle URLs
        const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]\}])/g;
        formattedText = formattedText.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        });

        // Handle headings
        formattedText = formattedText.replace(
            /^(#{1,6})\s*(.+)$/gm,
            (match, hashes, content) => `<h${hashes.length}>${content.trim()}</h${hashes.length}>`
        );

        // Handle blockquotes (multi-line support)
        formattedText = formattedText.replace(/^>\s*(.+)$/gm, (match, content) => `<blockquote>${content}</blockquote>`);

        // Handle unordered lists (better multi-line support)
        formattedText = formattedText.replace(
            /^((?:[-*+]\s+.+(?:\n|$))+)/gm,
            (match) => {
                const items = match.trim().split("\n").map(item => {
                    const content = item.replace(/^[-*+]\s+(.+)$/, "$1");
                    return `<li>${content}</li>`;
                }).join("");
                return `<ul>${items}</ul>`;
            }
        );

        // Handle ordered lists (better multi-line support)
        formattedText = formattedText.replace(
            /^((?:\d+\.\s+.+(?:\n|$))+)/gm,
            (match) => {
                const items = match.trim().split("\n").map(item => {
                    const content = item.replace(/^\d+\.\s+(.+)$/, "$1");
                    return `<li>${content}</li>`;
                }).join("");
                return `<ol>${items}</ol>`;
            }
        );

        // Handle text formatting (order matters)
        // Bold text
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        formattedText = formattedText.replace(/__(.*?)__/g, "<strong>$1</strong>");

        // Italic text (avoid conflict with bold)
        formattedText = formattedText.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
        formattedText = formattedText.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");

        // Strikethrough
        formattedText = formattedText.replace(/~~(.*?)~~/g, "<del>$1</del>");

        // Handle paragraphs and line breaks
        const lines = formattedText.split("\n");
        const processedLines = [];
        let inBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if we're in a block element
            const isBlockElement = line.startsWith("<h") || line.startsWith("<ul") ||
                line.startsWith("<ol") || line.startsWith("<blockquote") ||
                line.startsWith("<pre") || line.startsWith("<hr") ||
                line.includes("</ul>") || line.includes("</ol>") ||
                line.includes("</blockquote>") || line.includes("</pre>");

            if (isBlockElement) {
                inBlock = true;
                processedLines.push(line);
            } else if (line === "") {
                if (inBlock) {
                    inBlock = false;
                }
                processedLines.push("");
            } else if (!inBlock && line.length > 0) {
                // Regular paragraph text
                processedLines.push(`<p>${line}</p>`);
            } else {
                processedLines.push(line);
            }
        }

        formattedText = processedLines.join("\n");

        // Clean up extra newlines and normalize spacing
        formattedText = formattedText.replace(/\n{3,}/g, "\n\n");
        formattedText = formattedText.replace(/^\n+|\n+$/g, "");

        return escapeHtml(formattedText, true);
    };

    // Ctrl+F to open the finder
    document.addEventListener("keydown", async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            ui = document.getElementById("myFindBar");
            if (!ui) {
                const container = document.createElement("div");
                container.id = "myFindBar";
                container.style.display = "none";
                container.innerHTML = `
                    <div id="findBarContent">
                        <div id="findInputWrapper">
                            <input id="findInput" type="text" placeholder="Find..." autocomplete="off" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
                        </div>
                        <span id="findStatus"></span>
                        <button id="askButton" style="display: none;">Ask</button>
                        <div id="buttonGroup">
                            <button id="settingsButton" title="Settings">⚙</button>
                            <button id="findPrev">↑</button>
                            <button id="findNext">↓</button>
                            <button id="findClose">✕</button>
                        </div>
                    </div>
                    <div id="settingsPanel" style="display: none;">
                        <div id="settingsHeader">
                            <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Settings</h3>
                            <button id="settingsCloseButton">✕</button>
                        </div>
                        <div id="settingsContent">
                            <div class="settings-field">
                                <label for="apiKeyInput">OpenRouter API Key:</label>
                                <input id="apiKeyInput" type="password" placeholder="sk-or-v1-..." autocomplete="off" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
                                <small style="color: #aaa; font-size: 11px; display: block; margin-top: 4px;">
                                    Get your API key from <a href="https://openrouter.ai/keys" target="_blank" style="color: #4a9eff;">openrouter.ai</a>
                                </small>
                            </div>
                            <div class="settings-field">
                                <label for="modelSelect">Model:</label>
                                <div style="display: flex; gap: 6px; align-items: center;">
                                    <select id="modelSelect" style="flex: 1;">
                                        <option value="">Loading models...</option>
                                    </select>
                                    <button id="refreshModelsButton" title="Refresh models">🔄</button>
                                </div>
                                <div id="modelLoadingStatus" style="display: none; color: #aaa; font-size: 11px; margin-top: 4px;">Loading models...</div>
                            </div>
                            <div class="settings-actions">
                                <button id="testApiKeyButton">Test API Key</button>
                                <button id="saveSettingsButton">Save</button>
                                <button id="cancelSettingsButton">Cancel</button>
                            </div>
                            <div id="settingsMessage" style="display: none; margin-top: 8px; padding: 6px; border-radius: 4px; font-size: 12px;"></div>
                        </div>
                    </div>
                    <div id="chatContainer" style="display: none;">
                        <div id="chatHeader">
                            <button id="backToFindButton">🔍</button>
                            <button id="chatCloseButton">✕</button>
                        </div>
                        <div id="chatMessages"></div>
                        <div id="pageReadMessage" style="display: none;"></div>
                        <div id="chatInputArea">
                            <div id="chatInputWrapper">
                                <input id="chatInput" type="text" placeholder="Type your message..." autocomplete="off" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
                                <button id="chatSendButton">Ask</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(container);
                ui = container;

                const findBarContent = container.querySelector("#findBarContent");
                const findInput = container.querySelector("#findInput");
                const findStatus = container.querySelector("#findStatus");
                const askButton = container.querySelector("#askButton");
                const findPrev = container.querySelector("#findPrev");
                const findNext = container.querySelector("#findNext");
                const settingsButton = container.querySelector("#settingsButton");
                const settingsPanel = container.querySelector("#settingsPanel");
                const settingsCloseButton = container.querySelector("#settingsCloseButton");
                const apiKeyInput = container.querySelector("#apiKeyInput");
                const modelSelect = container.querySelector("#modelSelect");
                const refreshModelsButton = container.querySelector("#refreshModelsButton");
                const modelLoadingStatus = container.querySelector("#modelLoadingStatus");
                const testApiKeyButton = container.querySelector("#testApiKeyButton");
                const saveSettingsButton = container.querySelector("#saveSettingsButton");
                const cancelSettingsButton = container.querySelector("#cancelSettingsButton");
                const settingsMessage = container.querySelector("#settingsMessage");
                const chatContainer = container.querySelector("#chatContainer");
                const chatMessages = container.querySelector("#chatMessages");
                const pageReadMessage = container.querySelector("#pageReadMessage");
                const chatInput = container.querySelector("#chatInput");
                const chatSendButton = container.querySelector("#chatSendButton");
                const backToFindButton = container.querySelector("#backToFindButton");
                const chatCloseButton = container.querySelector("#chatCloseButton");

                // Load settings and populate UI
                await loadSettings();
                apiKeyInput.value = settings.apiKey;
                
                // Populate model dropdown
                const populateModels = async (forceRefresh = false) => {
                    modelLoadingStatus.style.display = "block";
                    modelSelect.disabled = true;
                    try {
                        const models = await fetchModels(forceRefresh);
                        modelSelect.innerHTML = "";
                        
                        if (models.length === 0) {
                            modelSelect.innerHTML = '<option value="">No models available</option>';
                            return;
                        }
                        
                        models.forEach(model => {
                            const option = document.createElement("option");
                            const modelId = model.id || model.name || model.model || "";
                            option.value = modelId;
                            // Use name if available, otherwise use id, fallback to model field
                            const displayName = model.name || model.id || model.model || modelId;
                            option.textContent = displayName;
                            if (modelId === settings.model) {
                                option.selected = true;
                            }
                            modelSelect.appendChild(option);
                        });
                    } catch (error) {
                        console.error("Error populating models:", error);
                        modelSelect.innerHTML = '<option value="">Error loading models</option>';
                    } finally {
                        modelLoadingStatus.style.display = "none";
                        modelSelect.disabled = false;
                    }
                };
                
                await populateModels();

                // Settings panel handlers
                const showSettings = () => {
                    findBarContent.style.display = "none";
                    chatContainer.style.display = "none";
                    settingsPanel.style.display = "block";
                    apiKeyInput.value = settings.apiKey;
                    settingsMessage.style.display = "none";
                };

                const hideSettings = () => {
                    settingsPanel.style.display = "none";
                    if (isChatMode) {
                        chatContainer.style.display = "block";
                    } else {
                        findBarContent.style.display = "flex";
                    }
                };

                const showSettingsMessage = (message, isError = false) => {
                    settingsMessage.textContent = message;
                    settingsMessage.style.display = "block";
                    settingsMessage.style.background = isError ? "rgba(255, 0, 0, 0.2)" : "rgba(0, 255, 0, 0.2)";
                    settingsMessage.style.color = isError ? "#ff6b6b" : "#51cf66";
                    setTimeout(() => {
                        settingsMessage.style.display = "none";
                    }, 5000);
                };

                settingsButton.addEventListener("click", showSettings);
                settingsCloseButton.addEventListener("click", hideSettings);
                cancelSettingsButton.addEventListener("click", hideSettings);

                refreshModelsButton.addEventListener("click", async () => {
                    refreshModelsButton.disabled = true;
                    refreshModelsButton.textContent = "⏳";
                    await populateModels(true);
                    refreshModelsButton.disabled = false;
                    refreshModelsButton.textContent = "🔄";
                    showSettingsMessage("Models refreshed", false);
                });

                testApiKeyButton.addEventListener("click", async () => {
                    const testKey = apiKeyInput.value.trim();
                    if (!testKey) {
                        showSettingsMessage("Please enter an API key first", true);
                        return;
                    }

                    testApiKeyButton.disabled = true;
                    testApiKeyButton.textContent = "Testing...";
                    
                    try {
                        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${testKey}`
                            },
                            body: JSON.stringify({
                                model: modelSelect.value || "openai/gpt-4o-mini",
                                messages: [{ role: "user", content: "test" }],
                                max_tokens: 5
                            })
                        });

                        if (response.ok) {
                            showSettingsMessage("API key is valid!", false);
                        } else {
                            const errorData = await response.json();
                            showSettingsMessage(`API key test failed: ${errorData.error?.message || response.statusText}`, true);
                        }
                    } catch (error) {
                        showSettingsMessage(`Error testing API key: ${error.message}`, true);
                    } finally {
                        testApiKeyButton.disabled = false;
                        testApiKeyButton.textContent = "Test API Key";
                    }
                });

                saveSettingsButton.addEventListener("click", async () => {
                    const newApiKey = apiKeyInput.value.trim();
                    const newModel = modelSelect.value;

                    if (!newApiKey) {
                        showSettingsMessage("Please enter an API key", true);
                        return;
                    }

                    if (!newModel) {
                        showSettingsMessage("Please select a model", true);
                        return;
                    }

                    settings.apiKey = newApiKey;
                    settings.model = newModel;
                    await saveSettings();
                    showSettingsMessage("Settings saved!", false);
                    setTimeout(() => {
                        hideSettings();
                    }, 1000);
                });

                let matches = [];
                let currentIndex = 0;
                let inputTimeout;
                let originalContent = null;

                const storeOriginalContent = () => {
                    if (!originalContent) {
                        originalContent = document.body.cloneNode(true);
                    }
                };

                const restoreOriginalContent = () => {
                    if (originalContent) {
                        const allHighlights = document.querySelectorAll(".highlight, .current");
                        allHighlights.forEach(span => {
                            const parent = span.parentNode;
                            if (parent) {
                                parent.replaceChild(document.createTextNode(span.textContent), span);
                            }
                        });
                        document.body.normalize();
                    }
                };

                const highlightMatches = () => {
                    restoreOriginalContent();
                    matches.forEach((match, i) => {
                        const range = document.createRange();
                        try {
                            range.setStart(match.node, match.start);
                            range.setEnd(match.node, match.end);
                            const span = document.createElement("span");
                            span.className = "highlight";
                            range.surroundContents(span);
                            matches[i].element = span;
                        } catch (e) {
                            console.log("Error highlighting match:", e);
                        }
                    });
                    updateFindStatus();
                };

                const updateFindStatus = () => {
                    const hasText = findInput.value.trim().length > 0;
                    const hasMatches = matches.length > 0;

                    if (!hasText) {
                        findStatus.textContent = "";
                        findStatus.classList.remove("visible");
                        askButton.style.display = "none";
                        findPrev.classList.remove("visible");
                        findNext.classList.remove("visible");
                        findStatus.style.display = "none";
                        findPrev.style.display = "none";
                        findNext.style.display = "none";
                    } else if (hasMatches) {
                        findStatus.textContent = `${currentIndex + 1}/${matches.length}`;
                        findStatus.style.display = "inline-block";
                        askButton.style.display = "none";
                        findPrev.style.display = "inline-block";
                        findNext.style.display = "inline-block";
                        findStatus.classList.add("visible");
                        findPrev.classList.add("visible");
                        findNext.classList.add("visible");
                    } else {
                        findStatus.textContent = "No matches";
                        findStatus.style.display = "inline-block";
                        askButton.style.display = "block";
                        findPrev.style.display = "none";
                        findNext.style.display = "none";
                        findStatus.classList.add("visible");
                        findPrev.classList.remove("visible");
                        findNext.classList.remove("visible");
                    }
                };

                const isElementVisible = (element) => {
                    const style = window.getComputedStyle(element);
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        !(style.height === "0px" && style.overflow === "hidden") &&
                        element.getClientRects().length > 0
                    );
                };

                const getAllPageText = () => {
                    let pageText = "";
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: (node) => {
                                const parent = node.parentNode;
                                if (!parent || parent.closest("#myFindBar") ||
                                    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.nodeName)) {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                let currentElement = parent;
                                while (currentElement && currentElement !== document.body) {
                                    if (!isElementVisible(currentElement)) {
                                        return NodeFilter.FILTER_REJECT;
                                    }
                                    currentElement = currentElement.parentNode;
                                }
                                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                            }
                        }
                    );

                    let totalTokens = 0;
                    let tokens = [];
                    let node;
                    while ((node = walker.nextNode())) {
                        const text = node.nodeValue.trim();
                        if (text) {
                            const nodeTokens = text.replace(/[^\w\s]|_/g, " ").split(/\s+/).filter(token => token.length > 0);
                            totalTokens += nodeTokens.length;
                            tokens.push(...nodeTokens);
                        }
                    }

                    const cappedTokens = tokens.slice(0, 500);
                    pageText = cappedTokens.join(" ");
                    const percentageSent = totalTokens > 0 ? Math.min((cappedTokens.length / totalTokens) * 100, 100).toFixed(2) : "0.00";
                    const pageTitle = document.title || "Untitled Page";
                    const pageUrl = window.location.href;
                    const metadata = `Page Title: ${pageTitle}\nURL: ${pageUrl}\nPercentage of content sent: ${percentageSent}%\n\n`;
                    return { pageText: metadata + pageText, percentageSent, totalTokens };
                };

                switchToChatMode = (initialQuery) => {
                    isChatMode = true;
                    if (!pageContext) {
                        pageContext = getAllPageText(); // Capture page context only once
                    }
                    findBarContent.style.display = "none";
                    chatContainer.style.display = "block";

                    const userMessage = document.createElement("div");
                    userMessage.className = "chat-message user-message";
                    userMessage.textContent = initialQuery;
                    chatMessages.appendChild(userMessage);

                    const skeletonContainer = document.createElement("div");
                    skeletonContainer.className = "chat-message assistant-message skeleton-container";
                    skeletonContainer.innerHTML = `
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line medium"></div>
                        <div class="skeleton-line short"></div>
                    `;
                    chatMessages.appendChild(skeletonContainer);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                };

                switchToFindMode = () => {
                    isChatMode = false;
                    pageContext = null; // Reset page context
                    findBarContent.style.display = "flex";
                    chatContainer.style.display = "none";
                    chatMessages.innerHTML = "";
                    pageReadMessage.style.display = "none";
                    conversationHistory = [];
                    restoreOriginalContent();

                    // Reset button loading states
                    askButton.classList.remove("loading");
                    askButton.textContent = "Ask";
                    chatSendButton.classList.remove("loading");
                    chatSendButton.textContent = "Ask";
                };

                const closeUI = () => {
                    container.classList.remove("slide-down");
                    container.classList.add("slide-up");
                    setTimeout(() => {
                        container.remove();
                        restoreOriginalContent();
                        ui = null;
                        conversationHistory = [];
                        isChatMode = false;
                        chatMessages.innerHTML = "";
                        pageReadMessage.style.display = "none";
                        pageContext = null;
                    }, 300);
                };

                const askOpenRouter = async (query) => {
                    if (isRequestInProgress) return;

                    // Ensure settings are loaded
                    await loadSettings();

                    // Check if API key is configured
                    if (!settings.apiKey || settings.apiKey.trim() === "") {
                        const errorMessage = document.createElement("div");
                        errorMessage.className = "chat-message assistant-message fade-in";
                        errorMessage.innerHTML = parseMarkdown(`**Configuration Required**\n\nPlease configure your OpenRouter API key in the settings (⚙ button).\n\nGet your API key from [openrouter.ai](https://openrouter.ai/keys)`);
                        if (!isChatMode) {
                            switchToChatMode(query);
                            chatMessages.appendChild(errorMessage);
                        } else {
                            chatMessages.appendChild(errorMessage);
                        }
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                        return;
                    }

                    // Check if model is selected
                    if (!settings.model || settings.model.trim() === "") {
                        const errorMessage = document.createElement("div");
                        errorMessage.className = "chat-message assistant-message fade-in";
                        errorMessage.innerHTML = parseMarkdown(`**Configuration Required**\n\nPlease select a model in the settings (⚙ button).`);
                        if (!isChatMode) {
                            switchToChatMode(query);
                            chatMessages.appendChild(errorMessage);
                        } else {
                            chatMessages.appendChild(errorMessage);
                        }
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                        return;
                    }

                    isRequestInProgress = true;
                    abortController = new AbortController();
                    container.querySelector("#chatInputArea").style.display = "none";

                    if (!isChatMode) {
                        switchToChatMode(query);
                    } else {
                        const userMessage = document.createElement("div");
                        userMessage.className = "chat-message user-message";
                        userMessage.textContent = query;
                        chatMessages.appendChild(userMessage);

                        const skeletonContainer = document.createElement("div");
                        skeletonContainer.className = "chat-message assistant-message skeleton-container";
                        skeletonContainer.innerHTML = `
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line medium"></div>
                            <div class="skeleton-line short"></div>
                        `;
                        chatMessages.appendChild(skeletonContainer);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }

                    const percentage = parseFloat(pageContext.percentageSent);
                    if (pageContext.totalTokens > 500) {
                        pageReadMessage.classList.add("skeleton");
                        pageReadMessage.textContent = "Analyzing page length...";
                        pageReadMessage.style.display = "block";
                    } else {
                        pageReadMessage.style.display = "none";
                    }

                    try {
                        if (conversationHistory.length > 10) {
                            conversationHistory = conversationHistory.slice(-10);
                        }

                        conversationHistory.push({ role: "user", content: query });

                        let messages;
                        if (conversationHistory.length === 1) {
                            const systemPrompt = `You are a helpful assistant that MUST follow strict formatting rules.

CRITICAL FORMATTING REQUIREMENTS:
- ALWAYS use proper Markdown formatting for ALL responses
- Use headings (# ## ###) for section organization
- Use **bold** for key terms and important information
- Use *italic* for emphasis and clarification
- Use \`inline code\` for technical terms, commands, and specific values
- Use code blocks (\`\`\`language\ncode\n\`\`\`) for multi-line code or structured data
- Use bullet points (- item) for lists and enumeration
- Use numbered lists (1. item) for sequential steps or rankings
- Use > blockquotes for quotes, definitions, or highlighting important notes
- Always separate paragraphs with blank lines
- Use --- for section dividers when appropriate
- Format URLs as proper links when mentioned

CONTENT STRUCTURE REQUIREMENTS:
- Start with a clear, concise summary or direct answer
- Organize information hierarchically with appropriate headings
- Use consistent formatting patterns throughout the response
- End with actionable next steps or conclusions when relevant

FORBIDDEN:
- Plain text responses without any formatting
- Inconsistent formatting patterns
- Missing structure or organization
- Unformatted code, commands, or technical terms

Here is the context of the webpage:

${pageContext.pageText}`;
                            messages = [
                                { role: "system", content: systemPrompt },
                                ...conversationHistory
                            ];
                        } else {
                            // Add formatting reminder for follow-up messages
                            const formatReminder = {
                                role: "system",
                                content: "Continue using strict Markdown formatting in your response. Use headings, bold text, lists, code blocks, and proper structure as required."
                            };
                            messages = [formatReminder, ...conversationHistory];
                        }

                        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${settings.apiKey}`,
                                "HTTP-Referer": window.location.href,
                                "X-Title": document.title || "FindAI Extension"
                            },
                            body: JSON.stringify({
                                model: settings.model,
                                messages: messages,
                                max_tokens: 800,
                                stream: true
                            }),
                            signal: abortController.signal
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            let errorMessage = `HTTP error! status: ${response.status}`;
                            
                            try {
                                const errorData = JSON.parse(errorText);
                                errorMessage = errorData.error?.message || errorMessage;
                            } catch (e) {
                                errorMessage = errorText || errorMessage;
                            }

                            if (response.status === 401) {
                                throw new Error("Invalid API key. Please check your OpenRouter API key in settings.");
                            } else if (response.status === 429) {
                                throw new Error("Rate limit exceeded. Please try again later.");
                            } else if (response.status === 404) {
                                throw new Error(`Model "${settings.model}" not found. Please select a different model in settings.`);
                            }
                            throw new Error(errorMessage);
                        }

                        if (pageContext.totalTokens > 500) {
                            pageReadMessage.classList.remove("skeleton");
                            pageReadMessage.textContent = `📄 Page too long: Only ${pageContext.percentageSent}% analyzed (${Math.min(500, pageContext.totalTokens)} of ${pageContext.totalTokens} tokens)`;
                            pageReadMessage.style.display = "block";
                        } else {
                            pageReadMessage.style.display = "none";
                        }

                        const responseMessage = document.createElement("div");
                        responseMessage.className = "chat-message assistant-message fade-in";
                        chatMessages.appendChild(responseMessage);

                        let fullResponse = "";
                        let hasReceivedContent = false;
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const chunk = decoder.decode(value);
                            const lines = chunk.split("\n");

                            for (const line of lines) {
                                if (line.startsWith("data: ")) {
                                    const data = line.slice(6);
                                    if (data === "[DONE]") break;

                                    try {
                                        const parsed = JSON.parse(data);
                                        const content = parsed.choices[0]?.delta?.content || "";
                                        if (content) {
                                            // Remove skeleton only when we receive the first content
                                            if (!hasReceivedContent) {
                                                const skeletonContainer = chatMessages.querySelector(".skeleton-container");
                                                if (skeletonContainer) {
                                                    skeletonContainer.remove();
                                                }
                                                hasReceivedContent = true;
                                            }
                                            fullResponse += content;
                                            responseMessage.innerHTML = parseMarkdown(fullResponse);
                                            chatMessages.scrollTop = chatMessages.scrollHeight;
                                        }
                                    } catch (e) {
                                        console.error("Error parsing stream chunk:", e, "Chunk:", data);
                                    }
                                }
                            }
                        }

                        conversationHistory.push({ role: "assistant", content: fullResponse });
                        responseMessage.scrollIntoView({ behavior: "smooth", block: "start" });
                    } catch (error) {
                        // Remove skeleton on error
                        const skeletonContainer = chatMessages.querySelector(".skeleton-container");
                        if (skeletonContainer) {
                            skeletonContainer.remove();
                        }

                        if (error.name === "AbortError") {
                            console.log("Request canceled by user");
                        } else {
                            console.error("Error with OpenRouter API:", error);
                            const errorMessage = document.createElement("div");
                            errorMessage.className = "chat-message assistant-message fade-in";
                            errorMessage.innerHTML = parseMarkdown(`**Error:** ${error.message}\n\nIf this persists, check your API key and model selection in settings (⚙ button).`);
                            chatMessages.appendChild(errorMessage);
                            errorMessage.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                        pageReadMessage.style.display = "none";
                    } finally {
                        isRequestInProgress = false;
                        abortController = null;
                        const chatInputArea = container.querySelector("#chatInputArea");
                        chatInputArea.style.display = "flex";
                        chatInputArea.style.animation = "slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)";

                        // Remove animation after it completes to allow re-triggering
                        setTimeout(() => {
                            chatInputArea.style.animation = "";
                        }, 400);

                        // Remove loading states from buttons
                        askButton.classList.remove("loading");
                        askButton.textContent = "Ask";
                        chatSendButton.classList.remove("loading");
                        chatSendButton.textContent = "Ask";
                    }
                };

                askButton.addEventListener("click", () => {
                    if (findInput.value.trim().length > 0 && !isRequestInProgress) {
                        askButton.classList.add("loading");
                        askButton.textContent = "...";
                        askOpenRouter(findInput.value);
                    }
                });

                findInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && matches.length === 0 && findInput.value.trim().length > 0 && !isRequestInProgress) {
                        e.preventDefault();
                        askButton.classList.add("loading");
                        askButton.textContent = "...";
                        askOpenRouter(findInput.value);
                    }
                });

                chatSendButton.addEventListener("click", () => {
                    if (chatInput.value.trim().length > 0 && !isRequestInProgress) {
                        chatSendButton.classList.add("loading");
                        chatSendButton.textContent = "...";
                        askOpenRouter(chatInput.value);
                        chatInput.value = "";
                    }
                });

                chatInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && chatInput.value.trim().length > 0 && !isRequestInProgress) {
                        e.preventDefault();
                        chatSendButton.classList.add("loading");
                        chatSendButton.textContent = "...";
                        askOpenRouter(chatInput.value);
                        chatInput.value = "";
                    }
                });

                backToFindButton.addEventListener("click", () => {
                    switchToFindMode();
                });

                chatCloseButton.addEventListener("click", () => {
                    closeUI();
                });

                const doFind = () => {
                    storeOriginalContent();
                    restoreOriginalContent();

                    const val = findInput.value.toLowerCase().trim();
                    if (!val) {
                        matches = [];
                        updateFindStatus();
                        return;
                    }

                    matches = [];
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: (node) => {
                                const parent = node.parentNode;
                                if (!parent || parent.closest("#myFindBar") ||
                                    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.nodeName)) {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                let currentElement = parent;
                                while (currentElement && currentElement !== document.body) {
                                    if (!isElementVisible(currentElement)) {
                                        return NodeFilter.FILTER_REJECT;
                                    }
                                    currentElement = currentElement.parentNode;
                                }
                                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                            }
                        }
                    );

                    let node;
                    while ((node = walker.nextNode())) {
                        const text = node.nodeValue.toLowerCase();
                        let idx = text.indexOf(val);
                        while (idx !== -1) {
                            matches.push({
                                node,
                                start: idx,
                                end: idx + val.length,
                                text: node.nodeValue.substring(idx, idx + val.length)
                            });
                            idx = text.indexOf(val, idx + 1);
                        }
                    }

                    if (matches.length > 0) {
                        requestAnimationFrame(() => {
                            highlightMatches();
                            navigate(0);
                        });
                    } else {
                        updateFindStatus();
                    }
                };

                findInput.addEventListener("input", () => {
                    clearTimeout(inputTimeout);
                    restoreOriginalContent();

                    inputTimeout = setTimeout(() => {
                        if (findInput.value.trim().length > 0) {
                            doFind();
                        } else {
                            restoreOriginalContent();
                            updateFindStatus();
                        }
                    }, 150);
                });

                const navigate = (dir) => {
                    if (!matches.length) {
                        currentIndex = 0;
                        updateFindStatus();
                        return;
                    }

                    document.querySelectorAll(".current").forEach(el => {
                        el.classList.remove("current");
                        el.style.backgroundColor = "#ffeb3b";
                        el.style.color = "#000";
                    });

                    if (dir !== 0) {
                        currentIndex = (currentIndex + dir + matches.length) % matches.length;
                    } else {
                        currentIndex = 0;
                    }

                    const currentMatch = matches[currentIndex];
                    if (currentMatch && currentMatch.element) {
                        currentMatch.element.classList.add("current");
                        currentMatch.element.style.backgroundColor = "#ff9800";
                        currentMatch.element.style.color = "#333";
                        currentMatch.element.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    updateFindStatus();
                };

                findPrev.addEventListener("click", () => navigate(-1));
                findNext.addEventListener("click", () => navigate(1));
                container.querySelector("#findClose").addEventListener("click", () => {
                    closeUI();
                });

                findInput.focus();
            } else if (isChatMode) {
                // Only switch to find mode if function is defined
                if (typeof switchToFindMode === 'function') {
                    switchToFindMode();
                }
            }

            if (ui && (ui.style.display === "none" || !ui.style.display)) {
                ui.style.display = "flex";
                ui.classList.remove("slide-up", "slide-down");
                // Force a reflow to ensure the element is in its initial state
                void ui.offsetHeight;
                // Then immediately add the slide-down class to trigger animation
                requestAnimationFrame(() => {
                    if (ui) {
                        ui.classList.add("slide-down");
                        const findInput = ui.querySelector("#findInput");
                        if (findInput) findInput.focus();
                    }
                });
            } else if (ui) {
                ui.classList.remove("slide-down");
                ui.classList.add("slide-up");
                setTimeout(() => {
                    if (ui && ui.parentNode) {
                        ui.style.display = "none";
                    }
                }, 300);
            }
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || e.key === "Esc") {
            if (ui && ui.style.display !== "none") {
                ui.classList.remove("slide-down");
                ui.classList.add("slide-up");
                setTimeout(() => {
                    if (ui && ui.parentNode) {
                        ui.style.display = "none";
                    }
                }, 300);
            }
        }
    });
})();