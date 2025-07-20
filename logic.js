// logic.js - The new core logic of the application, translated from excel.py

const logic = {
    // --- File Reading Functions ---
    readExcelFromBuffer(buffer) {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
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
                xmlString += `    <col>${(cell !== null && cell !== undefined) ? cell : ''}</col>\n`;
            });
            xmlString += '  </row>\n';
        });
        xmlString += '</root>';
        return xmlString;
    },

    writeToJsonString(data) {
        return JSON.stringify(data, null, 2);
    },

    // --- AI-related function ---
    dataToXmlString(data) {
        return this.writeToXmlString(data);
    },
    
    xmlStringToData(xmlString) {
        return this.readXmlFromString(xmlString);
    },

    // FINAL AI FIX: Implement streaming response
    async getAiResponse(history, gridDataXml, onChunk, onDone) {
        const apiKey = "sk-OTi0r196VHjX2iMgNaPevYrXSP4VKO4s2coOjIyPdXq02okY";
        const apiURL = "https://api.suanli.cn/v1/chat/completions";

        const systemPrompt = `你是一个强大的表格处理助手...`; // Same prompt as before

        const messages = [{ role: "system", content: systemPrompt }, ...history];
        
        try {
            const response = await fetch(apiURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model: "free:Qwen3-30B-A3B", messages: messages, stream: true }), // Enable streaming
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
    }
};