async function getWorkerUrl() {
    return document.getElementById('workerUrl').value.replace(/\/$/, '');
}

async function fetchData(endpoint, resultElementId) {
    const url = await getWorkerUrl() + endpoint;
    const resultEl = document.getElementById(resultElementId);
    resultEl.textContent = 'Cargando datos desde el Worker...';
    resultEl.className = '';
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        resultEl.textContent = JSON.stringify(data, null, 2);
        resultEl.className = response.ok ? 'success' : 'error';
        return data;
    } catch (error) {
        resultEl.textContent = `Error de red: ${error.message}\n\nNota: Asegúrate de que la URL del Worker sea correcta y que permita CORS.`;
        resultEl.className = 'error';
        return null;
    }
}

async function checkHealth() {
    await fetchData('/api/health', 'healthResult');
}

async function checkBatch() {
    await fetchData('/api/batch', 'batchResult');
}

async function checkHistory() {
    const symbol = document.getElementById('symbol').value.toUpperCase().trim();
    const period = document.getElementById('period').value;
    const limit = document.getElementById('limit').value || 5000;
    
    if (!symbol) {
        alert('Por favor ingresa un símbolo válido (Ej: AAPL)');
        return;
    }

    const endpoint = `/api/history?symbol=${symbol}&period=${period}&limit=${limit}`;
    const data = await fetchData(endpoint, 'historyResult');
    
    if (data && data.data) {
        renderHistoryTable(data.data, data.limit_used);
    } else {
        document.getElementById('historyTableContainer').innerHTML = '<p>No se encontraron registros o hubo un error.</p>';
    }
}

function renderHistoryTable(records, limitUsed) {
    const container = document.getElementById('historyTableContainer');
    if (!records || records.length === 0) {
        container.innerHTML = '<p>No se encontraron registros para este criterio.</p>';
        return;
    }

    let html = `<p><strong>Registros encontrados:</strong> ${records.length} (Límite solicitado: ${limitUsed})</p>`;
    html += '<table><thead><tr>';
    html += '<th>Fecha y Hora</th><th>Símbolo</th><th>Precio</th><th>Cambio ($)</th><th>Cambio (%)</th><th>Máximo</th><th>Mínimo</th>';
    html += '</tr></thead><tbody>';

    records.forEach(row => {
        // El timestamp viene en segundos desde Unix, lo convertimos a milisegundos
        const dateObj = new Date(row.timestamp * 1000);
        const dateStr = dateObj.toLocaleDateString('es-ES');
        const timeStr = dateObj.toLocaleTimeString('es-ES');
        
        html += `<tr>
            <td>${dateStr} ${timeStr}</td>
            <td><strong>${row.symbol}</strong></td>
            <td>$${row.price ? row.price.toFixed(2) : 'N/A'}</td>
            <td style="color: ${row.change >= 0 ? 'green' : 'red'}">
                ${row.change ? (row.change >= 0 ? '+' : '') + row.change.toFixed(2) : 'N/A'}
            </td>
            <td style="color: ${row.change_percent >= 0 ? 'green' : 'red'}">
                ${row.change_percent ? (row.change_percent >= 0 ? '+' : '') + row.change_percent.toFixed(2) + '%' : 'N/A'}
            </td>
            <td>$${row.day_high ? row.day_high.toFixed(2) : 'N/A'}</td>
            <td>$${row.day_low ? row.day_low.toFixed(2) : 'N/A'}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}
