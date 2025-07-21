document.addEventListener("DOMContentLoaded", () => {
    // --- STATE MANAGEMENT ---
    let currentFile = { name: "Untitled.xlsx", type: "xlsx", data: [] };
    let gridApi;

    // --- DOM ELEMENT REFERENCES ---
    const pages = { openFile: document.getElementById('open-file-page'), editor: document.getElementById('editor-page') };
    const fileInput = document.getElementById('file-input');
    const statusBar = document.getElementById('status-bar');
    const aiChatModal = document.getElementById('ai-chat-modal');
    const aiChatHistoryDiv = document.getElementById('ai-chat-history');
    const aiChatInput = document.getElementById('ai-chat-input');
    const aiChatSendButton = document.getElementById('ai-chat-send-button');
    const aiChatHistory = [];
    
    // --- INITIALIZATION ---
    function initialize() {
        // IMPORTANT: Create the grid first, so `gridApi` is defined.
        initializeGrid(); 
        // Then, set up all event listeners.
        setupEventListeners();
        showPage('openFile');
    }

    // --- PAGE NAVIGATION & UI ---
    function showPage(pageName) {
        Object.values(pages).forEach(p => p.classList.add('hidden'));
        if (pages[pageName]) pages[pageName].classList.remove('hidden');
    }

    // --- GRID SETUP ---
    function initializeGrid() {
        const gridOptions = {
            rowData: [],
            columnDefs: [],
            defaultColDef: { editable: true, resizable: true, sortable: true, filter: true },
            rowSelection: 'multiple',
            rowMultiSelectWithClick: true,
            onSelectionChanged: updateStatusBar,
        };
        const gridDiv = document.getElementById('main-grid');
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
    }
    
    function updateGrid(data, fileName) {
        currentFile.name = fileName;
        currentFile.data = data;
        const minRows = 50, minCols = 26;
        const dataRows = data.length;
        const dataCols = data.length > 0 ? Math.max(...data.map(row => (row ? row.length : 0))) : 0;
        const finalRows = Math.max(dataRows, minRows);
        const finalCols = Math.max(dataCols, minCols);
        
        const gridData = Array.from({ length: finalRows }, (_, r) => 
            Array.from({ length: finalCols }, (_, c) => 
                (data[r] && data[r][c] !== undefined) ? data[r][c] : ""
            )
        );

        const columnDefs = [
            { headerName: '#', width: 90, pinned: 'left', editable: false, valueGetter: 'node.rowIndex + 1', cellClass: 'row-number-cell', headerCheckboxSelection: true, checkboxSelection: true },
            ...Array.from({ length: finalCols }, (_, i) => ({
                headerName: String.fromCharCode(65 + i), field: i.toString(),
            }))
        ];
        
        const rowData = gridData.map(row => {
            const rowObj = {};
            row.forEach((cell, index) => { rowObj[index.toString()] = cell; });
            return rowObj;
        });

        gridApi.setGridOption('columnDefs', columnDefs);
        gridApi.setGridOption('rowData', rowData);
        document.title = `123Excel II - ${fileName}`;
        updateItemChoice();
        showPage('editor');
    }

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        document.getElementById('open-file-button-img').addEventListener('click', () => fileInput.click());
        document.getElementById('new-file-button-img').addEventListener('click', () => createNewFile('xlsx'));
        fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
        document.getElementById('save-button').addEventListener('click', saveFile);
        document.getElementById('exit-button').addEventListener('click', handleExit);
        document.getElementById('tag-file').addEventListener('click', () => switchTab('file'));
        document.getElementById('tag-jisuan').addEventListener('click', () => switchTab('jisuan'));
        
        document.getElementById('item-row-input').addEventListener('input', updateItemChoice);
        document.getElementById('get-max-button').addEventListener('click', () => performCalculation('max'));
        document.getElementById('get-min-button').addEventListener('click', () => performCalculation('min'));
        document.getElementById('get-avg-button').addEventListener('click', () => performCalculation('avg'));
        document.getElementById('get-customize-button').addEventListener('click', () => performCalculation('custom'));

        document.getElementById('tag-ai').addEventListener('click', () => showAiChat(true));
        document.getElementById('ai-chat-close-button').addEventListener('click', () => showAiChat(false));
        document.getElementById('ai-chat-send-button').addEventListener('click', sendAiMessage);
        document.getElementById('ai-chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
        });
    }

    function handleExit() {
        if (confirm("您确定要返回主页吗？未保存的更改将会丢失。")) {
            gridApi.setGridOption('rowData', []);
            gridApi.setGridOption('columnDefs', []);
            currentFile = { name: "Untitled.xlsx", type: "xlsx", data: [] };
            fileInput.value = null;
            updateStatusBar();
            showPage('openFile');
        }
    }

    // --- FILE HANDLING ---
    function handleFileSelect(file) {
        if (!file) return;
        currentFile.name = file.name;
        const fileExt = file.name.split('.').pop().toLowerCase();
        currentFile.type = fileExt;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            let data;
            try {
                if (fileExt === 'xlsx') data = logic.readExcelFromBuffer(content);
                else if (fileExt === 'xml') data = logic.readXmlFromString(content);
                else if (fileExt === 'json') data = logic.readJsonFromString(content);
                else { alert("不支持的文件类型"); return; }
                updateGrid(data, currentFile.name);
            } catch (err) { alert(`读取文件失败: ${err.message}`); }
        };
        if (fileExt === 'xlsx') reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    }
    
    function saveFile() {
        const newType = prompt("请输入要保存的文件类型 (xlsx, xml, json):", currentFile.type);
        if (newType === null) return;
        if (!['xlsx', 'xml', 'json'].includes(newType.toLowerCase())) {
            alert("无效的文件类型。"); return;
        }
        currentFile.type = newType.toLowerCase();
        const baseName = currentFile.name.split('.').slice(0, -1).join('.') || 'Untitled';
        currentFile.name = `${baseName}.${currentFile.type}`;
        const data = getGridData();
        let fileContent, mimeType;
        if (currentFile.type === 'xlsx') {
            fileContent = logic.writeToExcelBuffer(data);
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (currentFile.type === 'xml') {
            fileContent = logic.writeToXmlString(data); mimeType = 'application/xml';
        } else if (currentFile.type === 'json') {
            fileContent = logic.writeToJsonString(data); mimeType = 'application/json';
        }
        downloadFile(fileContent, currentFile.name, mimeType);
    }

    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function createNewFile(type) {
        currentFile.type = type;
        currentFile.name = `Untitled.${type}`;
        updateGrid([], currentFile.name);
    }
    
    function switchTab(tabName) {
        document.getElementById('file-tools').classList.toggle('hidden', tabName !== 'file');
        document.getElementById('jisuan-tools').classList.toggle('hidden', tabName !== 'jisuan');
        document.getElementById('jisuan-inputs').classList.toggle('hidden', tabName !== 'jisuan');
    }

    // --- CALCULATION LOGIC ---
    function updateItemChoice() {
        const itemRowInput = document.getElementById('item-row-input');
        const itemChoice = document.getElementById('item-choice');
        const items = logic.getItems(currentFile.data, itemRowInput.value);
        
        itemChoice.innerHTML = '';
        items.forEach(item => {
            if (item) {
                const option = document.createElement('option');
                option.value = item;
                option.textContent = item;
                itemChoice.appendChild(option);
            }
        });
    }

    function performCalculation(type) {
        try {
            const itemRow = document.getElementById('item-row-input').value;
            const nameCol = document.getElementById('name-col-input').value;
            const itemName = document.getElementById('item-choice').value;

            if (!itemRow || !nameCol || !itemName) {
                alert("请确保'项目行'、'名称列'已填写，并已选择一个项目。");
                return;
            }

            const names = logic.getNames(currentFile.data, itemRow, nameCol);
            const values = logic.getValue(currentFile.data, itemRow, nameCol, itemName);
            const nameValueDict = logic.getNameValueDict(names, values);

            let result;
            if (type === 'max') {
                const maxVal = logic.getMaxValue(nameValueDict);
                result = logic.getMaxNames(nameValueDict, maxVal);
            } else if (type === 'min') {
                const minVal = logic.getMinValue(nameValueDict);
                result = logic.getMinNames(nameValueDict, minVal);
            } else if (type === 'avg') {
                result = logic.getAverageValue(nameValueDict);
            } else if (type === 'custom') {
                const rule = document.getElementById('customize-input').value;
                if (!rule) { alert("自定义准则不能为空。"); return; }
                result = logic.getCustomizeValue(nameValueDict, rule);
            }
            
            alert(result.join('\n'));
        } catch (e) {
            alert(`计算时出错: ${e.message}`);
        }
    }

    // --- STATUS BAR LOGIC ---
    function updateStatusBar() {
        const selectedNodes = gridApi.getSelectedNodes();
        if (selectedNodes.length === 0) {
            statusBar.textContent = "通过点击行或使用复选框选择多行来查看统计信息"; return;
        }
        const selectedCells = [];
        selectedNodes.forEach(node => {
            if (node.data) {
                Object.values(node.data).forEach(value => {
                    const num = parseFloat(value);
                    if (!isNaN(num)) selectedCells.push(num);
                });
            }
        });
        if (selectedCells.length > 0) {
            const sum = selectedCells.reduce((a, b) => a + b, 0);
            const avg = sum / selectedCells.length;
            const max = Math.max(...selectedCells);
            const min = Math.min(...selectedCells);
            statusBar.textContent = `选中 ${selectedCells.length} 个数字 | 最大值:${max.toFixed(2)} 最小值:${min.toFixed(2)} 平均值:${avg.toFixed(2)} 总和:${sum.toFixed(2)}`;
        } else {
            statusBar.textContent = "在选中的行中未找到数字";
        }
    }

    // --- AI CHAT LOGIC ---
    function showAiChat(show) { aiChatModal.classList.toggle('hidden', !show); }
    
    async function sendAiMessage() {
        const userMessage = aiChatInput.value.trim();
        if (!userMessage) return;
        aiChatInput.value = '';
        aiChatSendButton.disabled = true;
        aiChatHistory.push({ role: "user", content: userMessage });
        renderAiHistory();
        aiChatHistory.push({ role: "assistant", content: "" });
        const aiMessageIndex = aiChatHistory.length - 1;
        const aiMessageElement = renderAiHistory();
        const gridData = getGridData();
        const gridDataXml = logic.dataToXmlString(gridData);
        
        await logic.getAiResponse(
            aiChatHistory.slice(0, -1),
            gridDataXml,
            (chunk) => {
                aiChatHistory[aiMessageIndex].content += chunk;
                if (aiMessageElement) aiMessageElement.textContent = `AI:\n${aiChatHistory[aiMessageIndex].content}`;
                aiChatHistoryDiv.scrollTop = aiChatHistoryDiv.scrollHeight;
            },
            (fullResponse) => {
                aiChatSendButton.disabled = false;
                aiChatInput.focus();
                const xmlMatch = fullResponse.match(/```xml\s*([\s\S]+?)\s*```/);
                if (xmlMatch && xmlMatch[1]) {
                    try {
                        const newData = logic.xmlStringToData(xmlMatch[1]);
                        updateGrid(newData, currentFile.name);
                    } catch(e) { console.error("AI XML parse error", e); }
                }
            }
        );
    }

    function renderAiHistory() {
        aiChatHistoryDiv.innerHTML = '';
        let lastMessageElement = null;
        aiChatHistory.forEach(msg => {
            const p = document.createElement('p');
            p.className = `${msg.role}-message`;
            p.textContent = `${msg.role === 'user' ? 'You' : 'AI'}:\n${msg.content}`;
            aiChatHistoryDiv.appendChild(p);
            lastMessageElement = p;
        });
        aiChatHistoryDiv.scrollTop = aiChatHistoryDiv.scrollHeight;
        return lastMessageElement;
    }

    // --- UTILITY FUNCTIONS ---
    function getGridData() {
        const data = [];
        gridApi.forEachNode(node => {
            if (node.data) {
                const rowValues = gridApi.getColumns().slice(1).map(col => node.data[col.getColDef().field] || "");
                data.push(rowValues);
            }
        });
        return trimEmptyCells(data);
    }
    
    function trimEmptyCells(data) {
        let maxRow = -1, maxCol = -1;
        for (let r = 0; r < data.length; r++) {
            if (!data[r]) continue;
            for (let c = 0; c < data[r].length; c++) {
                if (data[r][c] || data[r][c] === 0) {
                    maxRow = Math.max(maxRow, r);
                    maxCol = Math.max(maxCol, c);
                }
            }
        }
        return data.slice(0, maxRow + 1).map(row => row.slice(0, maxCol + 1));
    }
    
    // --- START THE APP ---
    initialize();
});