// logic.js - The new core logic of the application, now with all calculation functions.

const logic = {
    // --- File Reading Functions ---
    readExcelFromBuffer(buffer) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Using 'header: 1' converts the sheet to an array of arrays, defval ensures empty cells are ""
        return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    },

    readXmlFromString(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const data = [];
        const rowNodes = xmlDoc.getElementsByTagName('row');
        for (const rowNode of rowNodes) {
            const rowData = [];
            const colNodes = rowNode.getElementsByTagName('col');
            for (const colNode of colNodes) {
                rowData.push(colNode.textContent);
            }
            data.push(rowData);
        }
        return data;
    },

    readJsonFromString(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("JSON parse error:", e);
            return [];
        }
    },

    // --- File Writing Functions ---
    writeToExcelBuffer(data) {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    },

    writeToXmlString(data) {
        let xmlString = '<root>\n';
        data.forEach(row => {
            xmlString += '  <row>\n';
            (row || []).forEach(cell => {
                xmlString += `    <col>${(cell !== null && cell !== undefined) ? String(cell).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>') : ''}</col>\n`;
            });
            xmlString += '  </row>\n';
        });
        xmlString += '</root>';
        return xmlString;
    },

    writeToJsonString(data) {
        return JSON.stringify(data, null, 2); // Pretty print JSON
    },

    // --- AI-related function ---
    dataToXmlString(data) {
        return this.writeToXmlString(data);
    },
    
    xmlStringToData(xmlString) {
        return this.readXmlFromString(xmlString);
    },

    async getAiResponse(history, gridDataXml, onChunk, onDone) {
        const apiKey = "sk-OTi0r196VHjX2iMgNaPevYrXSP4VKO4s2coOjIyPdXq02okY";
        const apiURL = "https://api.suanli.cn/v1/chat/completions";

        const systemPrompt = `你是一个强大的表格处理助手，也能闲聊。
这是当前表格的XML数据：
<data>
${gridDataXml}
</data>
请根据我的要求进行对话或操作。
如果需要修改表格，请在你的回答中包含一个用\`\`\`xml ... \`\`\`包围的、完整的、新的表格XML代码块。
XML的格式必须是 <root><row><col>...</col></row>...</root>，不要有<data>标签，不要被现有表格大小所拘束。
如果没有修改表格，就正常聊天，不要输出XML。`;

        const messages = [{ role: "system", content: systemPrompt }, ...history];
        
        try {
            const response = await fetch(apiURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "free:Qwen3-30B-A3B",
                    messages: messages,
                    stream: true, // Enable streaming
                }),
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${await response.text()}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullResponse = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6);
                        if (jsonStr.trim() && jsonStr !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const delta = parsed.choices[0].delta.content;
                                if (delta) {
                                    fullResponse += delta;
                                    onChunk(delta); // Call the callback with the new piece of text
                                }
                            } catch (e) {
                                // Ignore parsing errors for incomplete JSON at the end of a chunk
                            }
                        }
                    }
                }
            }
            onDone(fullResponse); // Call the final callback when the stream is complete

        } catch (error) {
            console.error("AI Fetch Error:", error);
            onChunk(`\n[网络错误]: ${error.message}`);
            onDone(""); // Still call onDone to re-enable button etc.
        }
    },

    // --- NEW: All calculation functions from excel.py, translated to JavaScript ---

    getItems(data, itemRow) {
        itemRow = parseInt(itemRow, 10) - 1;
        return (data && data.length > itemRow && data[itemRow]) ? data[itemRow] : [];
    },

    getNames(data, itemRow, nameCol) {
        itemRow = parseInt(itemRow, 10) - 1;
        // Convert column letter to number if needed
        if (typeof nameCol === 'string' && /^[A-Z]+$/i.test(nameCol)) {
            nameCol = this.columnLetterToNumber(nameCol.toUpperCase());
        } else {
            nameCol = parseInt(nameCol, 10);
        }
        nameCol = nameCol - 1;
        
        const names = [];
        data.forEach(row => {
            if (row && row.length > nameCol) {
                names.push(row[nameCol]);
            } else {
                names.push(""); // Push empty string to maintain row alignment
            }
        });
        // Remove header rows
        return names.slice(itemRow + 1);
    },

    getValue(data, itemRow, nameCol, itemName) {
        const items = this.getItems(data, itemRow);
        itemRow = parseInt(itemRow, 10) - 1;
        // Convert column letter to number if needed
        if (typeof nameCol === 'string' && /^[A-Z]+$/i.test(nameCol)) {
            nameCol = this.columnLetterToNumber(nameCol.toUpperCase());
        } else {
            nameCol = parseInt(nameCol, 10);
        }
        nameCol = nameCol - 1;
        
        const itemIndex = items.indexOf(itemName);
        if (itemIndex === -1) {
            throw new Error("项目名称未在项目中找到或是空的");
        }
        
        const values = [];
        data.forEach(row => {
            if (row && row.length > itemIndex) {
                values.push(row[itemIndex]);
            } else {
                values.push(""); // Push empty string to maintain row alignment
            }
        });
        return values.slice(itemRow + 1);
    },

    // Helper function to convert Excel column letters to numbers (A=1, B=2, ..., Z=26, AA=27, ...)
    columnLetterToNumber(letter) {
        let result = 0;
        for (let i = 0; i < letter.length; i++) {
            result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        return result;
    },

    getNameValueDict(names, values) {
        const dict = {};
        const minLen = Math.min(names.length, values.length);
        for (let i = 0; i < minLen; i++) {
            // Only add entries where the name is not empty
            if (names[i]) {
                dict[names[i]] = values[i];
            }
        }
        return dict;
    },
    
    _getNumericValues(nameValueDict) {
        return Object.values(nameValueDict)
            .map(v => parseFloat(v))
            .filter(v => !isNaN(v));
    },

    getMaxValue(nameValueDict) {
        const values = this._getNumericValues(nameValueDict);
        return values.length > 0 ? Math.max(...values) : null;
    },

    getMaxNames(nameValueDict, maxNum) {
        if (maxNum === null) return ["最大值：", "无有效数据"];
        const output = ["最大值："];
        for (const name in nameValueDict) {
            if (parseFloat(nameValueDict[name]) === maxNum) {
                output.push(`${name} : ${nameValueDict[name]}`);
            }
        }
        return output;
    },

    getMinValue(nameValueDict) {
        const values = this._getNumericValues(nameValueDict);
        return values.length > 0 ? Math.min(...values) : null;
    },

    getMinNames(nameValueDict, minNum) {
        if (minNum === null) return ["最小值：", "无有效数据"];
        const output = ["最小值："];
        for (const name in nameValueDict) {
            if (parseFloat(nameValueDict[name]) === minNum) {
                output.push(`${name} : ${nameValueDict[name]}`);
            }
        }
        return output;
    },

    getAverageValue(nameValueDict) {
        const values = this._getNumericValues(nameValueDict);
        if (values.length === 0) return ["平均值:", "无有效数据"];
        const sum = values.reduce((a, b) => a + b, 0);
        const average = sum / values.length;
        return [`平均值: ${average.toFixed(2)}`];
    },
    
    getCustomizeValue(nameValueDict, rule) {
        if (!rule) return [];
        const results = [];
        let computePart = null;
        let boolPart = rule;

        if (rule.includes('#')) {
            [boolPart, computePart] = rule.split('#', 2).map(s => s.trim());
        }

        for (const name in nameValueDict) {
            try {
                const x = parseFloat(nameValueDict[name]);
                if (isNaN(x)) continue;
                
                // A safer way to evaluate expressions in JS
                // Note: 'x' must be declared in the scope where this function is called.
                const isSatisfied = new Function('x', `return ${boolPart}`)(x);

                if (isSatisfied) {
                    if (computePart) {
                        const computeResult = new Function('x', `return ${computePart}`)(x);
                        results.push(`${name} = ${nameValueDict[name]} | ${computeResult}`);
                    } else {
                        results.push(`${name} = ${nameValueDict[name]}`);
                    }
                }
            } catch (e) {
                // Ignore errors from invalid rules or values
                console.warn(`Could not evaluate rule for ${name}:`, e);
            }
        }
        return results;
    }
};
