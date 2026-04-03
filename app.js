// ==========================================
// 1. ESTADO E UTILITÁRIOS (SISTEMA CENTRAL)
// ==========================================
const $ = (s) => document.querySelector(s);

let categorias = JSON.parse(localStorage.getItem("categorias")) || [
    { id: 1, nome: "Alimentação", tipo: "flexível", cor: "#39FF14", limite: 500 },
    { id: 2, nome: "Transporte", tipo: "flexível", cor: "#33CFFF", limite: 200 }
];
let gastos = JSON.parse(localStorage.getItem("gastos")) || [];
let ganhosExtras = JSON.parse(localStorage.getItem("ganhosExtras")) || []; // ADIÇÃO
let config = JSON.parse(localStorage.getItem("config")) || { 
    tema: "dark", 
    notifs: { limite: true, meta: true, progresso: true }, 
    percentuais: [80],
    tipoGrafico: "bar" 
};

// GARANTIA DE COMPATIBILIDADE (Para o menu de configurações abrir sem erros de versão)
if (!config.notifs || config.notifs.progresso === undefined) {
    config.notifs = { ...config.notifs, progresso: true };
}

let metaData = JSON.parse(localStorage.getItem("meta")) || { 
    meta: 1000, 
    guardado: 0, 
    mesesPrev: 6, 
    salario: 0, 
    valorMensal: 0, 
    estrategia: "tempo",
    ultimoRecalculoCheck: "" 
};

const saveAll = () => {
    localStorage.setItem("categorias", JSON.stringify(categorias));
    localStorage.setItem("gastos", JSON.stringify(gastos));
    localStorage.setItem("ganhosExtras", JSON.stringify(ganhosExtras)); // ADIÇÃO
    localStorage.setItem("config", JSON.stringify(config));
    localStorage.setItem("meta", JSON.stringify(metaData));
};

const formatBR = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function showToast(msg, tipo = "sucesso") {
    const toast = document.createElement("div");
    toast.style = `position:fixed; top:20px; right:20px; padding:15px 25px; background:${tipo === 'erro' ? '#ff4444' : 'var(--verde-neon)'}; color:#000; border-radius:10px; font-weight:bold; z-index:10000; box-shadow:0 10px 30px rgba(0,0,0,0.5); cursor:pointer;`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    if(tipo !== 'erro') setTimeout(() => { if(toast) toast.remove(); }, 3000);
    return toast;
}

// ==========================================
// 2. INTELIGÊNCIA DE RECALCULO (MELHORADO)
// ==========================================
window.verificarRecalculoInteligente = () => {
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);
    
    if (metaData.ultimoRecalculoCheck === mesAtual || metaData.salario <= 0) return;

    const dataPassada = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesPassado = dataPassada.toISOString().slice(0, 7);
    
    const gastoMesPassado = gastos
        .filter(g => g.data.startsWith(mesPassado))
        .reduce((a, b) => a + b.valor, 0);

    const ganhosMesPassado = ganhosExtras
        .filter(g => g.data.startsWith(mesPassado))
        .reduce((a, b) => a + b.valor, 0);

    const sobrouReal = (metaData.salario + ganhosMesPassado) - gastoMesPassado;

    if (sobrouReal < metaData.valorMensal) {
        const deficit = metaData.valorMensal - sobrouReal;
        const toast = showToast(`🚨 Meta não atingida! Faltou ${formatBR(deficit)}. <br>Clique para ajustar seu plano.`, "erro");
        
        toast.onclick = () => {
            toast.remove();
            window.mostrarModalAjuste(deficit);
        };
        
        metaData.ultimoRecalculoCheck = mesAtual;
        saveAll();
    }
};

window.mostrarModalAjuste = (deficit) => {
    const overlay = document.createElement("div");
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:20000; display:flex; align-items:center; justify-content:center; padding:20px;";
    
    const mesesRestantes = metaData.mesesPrev > 1 ? metaData.mesesPrev : 1;
    const sugestaoNovoValor = metaData.valorMensal + (deficit / mesesRestantes);

    overlay.innerHTML = `
        <div class="card" style="max-width:400px; border:2px solid var(--verde-neon); text-align:center">
            <h3>Ajuste de Meta</h3>
            <p>Você economizou menos que o planejado. Como deseja compensar os <b>${formatBR(deficit)}</b> restantes?</p>
            <br>
            <button onclick="window.processarAjuste('tempo')" style="width:100%; margin-bottom:10px">Aumentar Prazo (Manter economia atual)</button>
            <button onclick="window.processarAjuste('valor', ${sugestaoNovoValor})" style="width:100%; background:var(--verde-neon); color:#000">Ajustar Gastos (Economizar mais por mês)</button>
        </div>
    `;
    document.body.appendChild(overlay);
    window.modalAjusteRef = overlay;
};

window.processarAjuste = (tipo, novoValor = 0) => {
    if (tipo === 'tempo') {
        metaData.mesesPrev += 1;
        metaData.valorMensal = (metaData.meta - metaData.guardado) / metaData.mesesPrev;
    } else {
        metaData.valorMensal = novoValor;
    }
    saveAll();
    window.modalAjusteRef.remove();
    showToast("Plano recalculado!");
    window.drawDashboard();
};

// ==========================================
// 3. MOTOR DO GRÁFICO (HÍBRIDO)
// ==========================================
function renderChartCompleto(id, dados) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const novoCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(novoCanvas, canvas);
    
    const ctx = novoCanvas.getContext("2d");
    const valores = categorias.map(c => dados.filter(g => g.categoriaId == c.id).reduce((a, b) => a + b.valor, 0));
    const totalGeral = valores.reduce((a, b) => a + b, 0);

    // Cor dinâmica para o texto baseada no tema
    const corTexto = config.tema === 'light' ? '#333' : '#fff';

    novoCanvas.width = 600;
    novoCanvas.height = 320; 

    if (config.tipoGrafico === 'pie' && totalGeral > 0) {
        let anguloInicial = -Math.PI / 2;
        const centerX = 200, centerY = 160, raio = 110;

        valores.forEach((v, i) => {
            if (v <= 0) return;
            const fatia = (v / totalGeral) * (Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, raio, anguloInicial, anguloInicial + fatia);
            ctx.closePath();
            ctx.fillStyle = categorias[i].cor;
            ctx.shadowBlur = 15; ctx.shadowColor = categorias[i].cor;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke();
            anguloInicial += fatia;
        });

        ctx.textAlign = "left"; ctx.font = "bold 11px sans-serif";
        valores.forEach((v, i) => {
            if (v <= 0) return;
            ctx.fillStyle = categorias[i].cor;
            ctx.fillRect(380, 50 + (i * 25), 15, 15);
            ctx.fillStyle = corTexto;
            ctx.fillText(`${categorias[i].nome}: ${formatBR(v)}`, 405, 62 + (i * 25));
        });
    } else {
        const maxVal = Math.max(...valores, 500);
        const ALTURA_BASE = 240;
        const AREA_UTIL = 180;

        ctx.strokeStyle = config.tema === 'light' ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)";
        ctx.fillStyle = "#888"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
        [0, 0.5, 1].forEach(p => {
            const y = ALTURA_BASE - (p * AREA_UTIL);
            ctx.fillText(formatBR(maxVal * p).split(',')[0], 45, y + 3);
            ctx.beginPath(); ctx.moveTo(55, y); ctx.lineTo(570, y); ctx.stroke();
        });

        valores.forEach((v, i) => {
            const h = (v / maxVal) * AREA_UTIL;
            const x = 70 + (i * 85);
            const y = ALTURA_BASE - h;
            const cor = categorias[i].cor;
            ctx.fillStyle = cor; ctx.shadowBlur = 15; ctx.shadowColor = cor;
            ctx.fillRect(x, y, 40, h); ctx.shadowBlur = 0;
            ctx.fillStyle = corTexto; ctx.textAlign = "center"; ctx.font = "bold 10px sans-serif";
            ctx.fillText(categorias[i].nome, x + 20, ALTURA_BASE + 20);
        });
    }
}

// ==========================================
// 4. DASHBOARD (ATUALIZADO COM GANHOS E AUTOMATIZAÇÃO)
// ==========================================
window.drawDashboard = function() {
    window.verificarRecalculoInteligente();
    
    // AUTOMATIZAÇÃO DE GASTOS FIXOS (IMPLEMENTAÇÃO SOLICITADA)
    const mesAtual = new Date().toISOString().slice(0, 7);
    let houveMudanca = false;
    categorias.filter(c => c.tipo === 'fixo').forEach(c => {
        const jaExiste = gastos.some(g => g.categoriaId === c.id && g.data.startsWith(mesAtual));
        if (!jaExiste && c.limite > 0) {
            gastos.push({ 
                id: Date.now() + Math.random(), 
                categoriaId: c.id, 
                valor: c.limite, 
                data: `${mesAtual}-01`, 
                descricao: "Gasto Fixo Automático" 
            });
            houveMudanca = true;
        }
    });
    if (houveMudanca) saveAll();

    const main = $("#mainContainer");
    const gastosMes = gastos.filter(g => g.data.startsWith(mesAtual));
    const totalGasto = gastosMes.reduce((a, b) => a + b.valor, 0);
    const totalExtras = ganhosExtras.filter(g => g.data.startsWith(mesAtual)).reduce((a, b) => a + b.valor, 0);
    const rendaTotal = metaData.salario + totalExtras;

    main.innerHTML = `
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div class="card" style="flex:2">
                <h3>Gasto no Mês</h3>
                <p style="font-size:1.8rem; color:var(--verde-neon); text-shadow: 0 0 10px var(--verde-neon)">${formatBR(totalGasto)}</p>
                ${totalExtras > 0 ? `<small style="color:#33CFFF">+ ${formatBR(totalExtras)} extras</small>` : ''}
            </div>
            <div class="card" style="flex:1; text-align:right">
                <h3>Cofrinho 🐖</h3>
                <p style="font-size:1.3rem;">${formatBR(metaData.guardado)}</p>
            </div>
        </div>
        <div class="card">
            <p style="font-size:0.8rem; opacity:0.7; margin-bottom:5px">Meta Final: ${formatBR(metaData.meta)} | Prazo: ${metaData.mesesPrev} meses</p>
            <h3>Meta Mensal: <span style="color:var(--verde-neon)">${formatBR(metaData.valorMensal)}</span></h3>
            <div style="background:#222; border-radius:10px; height:10px; margin-top:10px">
                <div style="background:var(--verde-neon); height:100%; width:${rendaTotal > 0 ? Math.min((totalGasto / rendaTotal) * 100, 100) : 0}%; border-radius:10px; box-shadow: 0 0 10px var(--verde-neon)"></div>
            </div>
        </div>
        <div class="card">
            <h3>Distribuição por Categoria</h3>
            <canvas id="graficoMain"></canvas>
        </div>`;

    requestAnimationFrame(() => {
        renderChartCompleto("graficoMain", gastosMes);
    });
};

// ==========================================
// 5. GASTOS E NOTIFICAÇÕES DE USO
// ==========================================
window.drawGastos = function() {
    const categoriasOrdenadas = [...categorias].sort((a, b) => a.nome.localeCompare(b.nome));

    $("#mainContainer").innerHTML = `
        <div class="card">
            <h3 id="titGasto">Novo Gasto</h3>
            <input type="hidden" id="editGastoId">
            <select id="catInp">
                <option value="">-- Categoria --</option>
                ${categoriasOrdenadas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
            </select>
            <input type="number" id="valInp" placeholder="Valor">
            <input type="date" id="datInp" value="${new Date().toISOString().split('T')[0]}">
            <input type="text" id="desInp" placeholder="Descrição">
            <button onclick="window.salvarGasto()" style="width:100%">Salvar Gasto</button>
        </div>
        <div class="card">
            <h3>Resumo de Limites (Mês Atual)</h3>
            <table>
                <thead><tr><th>Categoria</th><th>Gasto Atual</th><th>Limite</th><th>%</th></tr></thead>
                <tbody id="resumoLimites"></tbody>
            </table>
        </div>
        <div class="card">
            <h3>Lançamentos do Mês</h3>
            <table>
                <thead><tr><th>Data</th><th>Cat.</th><th>Valor</th><th style="text-align:center">Ações</th></tr></thead>
                <tbody id="listaGastos"></tbody>
            </table>
        </div>`;
    window.renderTabelasGastos();
};

window.renderTabelasGastos = () => {
    const lista = $("#listaGastos");
    const resumo = $("#resumoLimites");
    const mesAtual = new Date().toISOString().slice(0, 7);
    lista.innerHTML = ""; resumo.innerHTML = "";

    const gastosMesAtual = gastos.filter(g => g.data.startsWith(mesAtual));

    gastosMesAtual.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(g => {
        const cat = categorias.find(c => c.id == g.categoriaId);
        lista.innerHTML += `<tr><td>${g.data.split('-').reverse().join('/')}</td><td>${cat?.nome || '---'}</td><td>${formatBR(g.valor)}</td>
        <td style="display:flex; gap:5px; justify-content:center"><button onclick="window.prepararEdicaoGasto(${g.id})">✏️</button><button onclick="window.excluirGasto(${g.id})">🗑️</button></td></tr>`;
    });

    categorias.forEach(c => {
        const totalCat = gastosMesAtual.filter(g => g.categoriaId == c.id).reduce((a, b) => a + b.valor, 0);
        const perc = c.limite > 0 ? (totalCat / c.limite) * 100 : 0;
        resumo.innerHTML += `<tr><td>${c.nome}</td><td>${formatBR(totalCat)}</td><td>${formatBR(c.limite)}</td><td style="color:${perc > 100 ? '#ff4444' : 'var(--verde-neon)'}">${perc.toFixed(0)}%</td></tr>`;
    });
};

window.salvarGasto = () => {
    const id = $("#editGastoId").value; const catId = $("#catInp").value; const valor = parseFloat($("#valInp").value);
    if (!catId || isNaN(valor)) return showToast("Preencha Categoria e Valor!", "erro");
    const dados = { id: id ? parseInt(id) : Date.now(), categoriaId: parseInt(catId), valor, data: $("#datInp").value, descricao: $("#desInp").value };
    if (id) { gastos[gastos.findIndex(g => g.id == id)] = dados; } else { gastos.push(dados); }
    
    // NOTIFICAÇÕES DE USO DO ORÇAMENTO (IMPLEMENTAÇÃO SOLICITADA)
    if (config.notifs && config.notifs.progresso) {
        const mesAtual = new Date().toISOString().slice(0, 7);
        const totalGasto = gastos.filter(g => g.data.startsWith(mesAtual)).reduce((a, b) => a + b.valor, 0);
        const dispMensal = metaData.salario - metaData.valorMensal;
        if (dispMensal > 0) {
            const percUso = (totalGasto / dispMensal) * 100;
            if (percUso >= 100) showToast("⚠️ ALERTA: 100% do orçamento atingido!", "erro");
            else if (percUso >= 75) showToast("📢 Alerta: 75% do orçamento utilizado.");
            else if (percUso >= 50) showToast("💡 Controle: 50% do orçamento atingido.");
        }
    }

    saveAll(); window.drawGastos();
};

window.excluirGasto = (id) => { if (confirm("Deseja apagar?")) { gastos = gastos.filter(x => x.id !== id); saveAll(); window.drawGastos(); } };
window.prepararEdicaoGasto = (id) => {
    const g = gastos.find(x => x.id == id);
    $("#editGastoId").value = g.id; $("#catInp").value = g.categoriaId; $("#valInp").value = g.valor; $("#datInp").value = g.data; $("#desInp").value = g.descricao;
    window.scrollTo(0, 0);
};

// ==========================================
// 5.5. GANHOS EXTRAS
// ==========================================
window.drawGanhos = function() {
    $("#mainContainer").innerHTML = `
        <div class="card">
            <h3 id="titGanho">Novo Ganho Extra</h3>
            <input type="hidden" id="editGanhoId">
            <input type="text" id="origemInp" placeholder="Origem (Ex: Freelance, Venda)">
            <input type="number" id="valGanhoInp" placeholder="Valor">
            <input type="date" id="datGanhoInp" value="${new Date().toISOString().split('T')[0]}">
            <button onclick="window.salvarGanho()" style="width:100%; background:var(--verde-neon); color:#000">Salvar Ganho</button>
        </div>
        <div class="card">
            <h3>Ganhos do Mês Atual</h3>
            <table>
                <thead><tr><th>Data</th><th>Origem</th><th>Valor</th><th style="text-align:center">Ações</th></tr></thead>
                <tbody id="listaGanhos"></tbody>
            </table>
        </div>`;
    window.renderTabelaGanhos();
};

window.renderTabelaGanhos = () => {
    const lista = $("#listaGanhos");
    const mesAtual = new Date().toISOString().slice(0, 7);
    lista.innerHTML = "";
    const ganhosMesAtual = ganhosExtras.filter(g => g.data.startsWith(mesAtual));
    ganhosMesAtual.forEach(g => {
        lista.innerHTML += `<tr><td>${g.data.split('-').reverse().join('/')}</td><td>${g.origem}</td><td style="color:var(--verde-neon)">+ ${formatBR(g.valor)}</td>
        <td style="display:flex; gap:5px; justify-content:center"><button onclick="window.prepararEdicaoGanho(${g.id})">✏️</button><button onclick="window.excluirGanho(${g.id})">🗑️</button></td></tr>`;
    });
};

window.salvarGanho = () => {
    const id = $("#editGanhoId").value; const origem = $("#origemInp").value; const valor = parseFloat($("#valGanhoInp").value);
    if (!origem || isNaN(valor)) return showToast("Preencha Origem e Valor!", "erro");
    const dados = { id: id ? parseInt(id) : Date.now(), origem, valor, data: $("#datGanhoInp").value };
    if (id) ganhosExtras[ganhosExtras.findIndex(g => g.id == id)] = dados; else ganhosExtras.push(dados);
    saveAll(); window.drawGanhos(); showToast("Ganho registrado!");
};

window.excluirGanho = (id) => { if (confirm("Apagar?")) { ganhosExtras = ganhosExtras.filter(x => x.id !== id); saveAll(); window.drawGanhos(); } };
window.prepararEdicaoGanho = (id) => {
    const g = ganhosExtras.find(x => x.id == id);
    $("#editGanhoId").value = g.id; $("#origemInp").value = g.origem; $("#valGanhoInp").value = g.valor; $("#datGanhoInp").value = g.data;
};

// ==========================================
// 6. CATEGORIAS E NOTIFICAÇÃO DE LIMITES
// ==========================================
window.drawCategorias = function() {
    $("#mainContainer").innerHTML = `
        <div class="card">
            <h3 id="titCat">Nova Categoria</h3>
            <input type="hidden" id="editCatId">
            <input type="text" id="catNome" placeholder="Nome">
            <input type="number" id="catLim" placeholder="Limite">
            <select id="catTipo"><option value="flexível">Flexível</option><option value="fixo">Fixo</option></select>
            <div style="margin:10px 0">Cor: <input type="color" id="catCorCustom" value="#39FF14" style="background:none; border:none"></div>
            <button onclick="window.salvarCategoria()" style="width:100%">Salvar Categoria</button>
        </div>
        <div class="card"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Ações</th></tr></thead><tbody id="corpoCat"></tbody></table></div>`;
    
    categorias.forEach(c => {
        $("#corpoCat").innerHTML += `<tr><td style="border-left:5px solid ${c.cor}; padding-left:10px">${c.nome}</td><td>${c.tipo}</td>
        <td style="display:flex; gap:5px; justify-content:center"><button onclick="window.prepararEdicaoCat(${c.id})">✏️</button><button onclick="window.excluirCategoria(${c.id})">🗑️</button></td></tr>`;
    });
};

window.salvarCategoria = () => {
    const id = $("#editCatId").value; const nome = $("#catNome").value; const limite = parseFloat($("#catLim").value) || 0;
    if (!nome) return showToast("Nome obrigatório!", "erro");
    
    // SISTEMA DE NOTIFICAÇÕES (LIMITES DE CATEGORIA) (IMPLEMENTAÇÃO SOLICITADA)
    if (config.notifs && config.notifs.limite) {
        const somaLimites = categorias.filter(c => c.id != id).reduce((a, b) => a + b.limite, 0) + limite;
        const disponivel = metaData.salario - metaData.valorMensal;
        if (somaLimites > disponivel) {
            showToast(`⚠️ O total dos limites (${formatBR(somaLimites)}) ultrapassa o disponível no mês! Sugerimos ajustar categorias flexíveis.`, "erro");
        }
    }

    const nova = { id: id ? parseInt(id) : Date.now(), nome, limite, tipo: $("#catTipo").value, cor: $("#catCorCustom").value };
    if (id) { categorias[categorias.findIndex(c => c.id == id)] = nova; } else { categorias.push(nova); }
    saveAll(); window.drawCategorias();
};

window.prepararEdicaoCat = (id) => {
    const c = categorias.find(x => x.id == id);
    
    // CONFIRMAÇÃO AO EDITAR CATEGORIAS FIXAS (IMPLEMENTAÇÃO SOLICITADA)
    if (c.tipo === 'fixo') {
        if (!confirm("Esta é uma categoria FIXA. Deseja realmente prosseguir com a edição?")) return;
    }

    $("#editCatId").value = c.id; $("#catNome").value = c.nome; $("#catLim").value = c.limite; $("#catTipo").value = c.tipo; $("#catCorCustom").value = c.cor;
};

window.excluirCategoria = (id) => { if (confirm("Apagar categoria?")) { categorias = categorias.filter(c => c.id !== id); saveAll(); window.drawCategorias(); } };

// ==========================================
// 7. HISTÓRICO
// ==========================================
window.drawHistorico = function() {
    const main = $("#mainContainer");
    main.innerHTML = `
        <div class="card">
            <h3>Filtro Mensal</h3>
            <input type="month" id="filtroMes" value="${new Date().toISOString().slice(0, 7)}" onchange="window.renderHistorico()">
        </div>
        <div id="resultadoObjetivo"></div>
        <div id="areaGraficoHist" class="card"><canvas id="graficoHistorico"></canvas></div>
        <div class="card" id="listaExpandHistorico"></div>`;
    window.renderHistorico();
};

window.renderHistorico = function() {
    const mes = $("#filtroMes").value;
    const filtrados = gastos.filter(g => g.data.startsWith(mes));
    const extras = ganhosExtras.filter(g => g.data.startsWith(mes));
    const list = $("#listaExpandHistorico");
    const areaAviso = $("#resultadoObjetivo");

    if (filtrados.length === 0 && extras.length === 0) {
        areaAviso.innerHTML = `<div class="card">🚫 Sem dados para este mês.</div>`;
        $("#areaGraficoHist").style.display = "none";
        list.style.display = "none";
        return;
    }

    $("#areaGraficoHist").style.display = "block";
    list.style.display = "block";
    renderChartCompleto("graficoHistorico", filtrados);

    const totalGasto = filtrados.reduce((a, b) => a + b.valor, 0);
    const totalExtras = extras.reduce((a, b) => a + b.valor, 0);
    const rendaTotal = metaData.salario + totalExtras;
    const limiteGastoPermitido = rendaTotal - metaData.valorMensal;
    const economizado = rendaTotal - totalGasto;
    const atingido = totalGasto <= limiteGastoPermitido;

    areaAviso.innerHTML = `
        <div class="card" style="border-left: 5px solid ${atingido ? 'var(--verde-neon)' : '#ff4444'}">
            <p>Renda Total (Salário + Extras): <b>${formatBR(rendaTotal)}</b></p>
            <p>Pode gastar p/ mês: <b>${formatBR(limiteGastoPermitido)}</b></p>
            <p>Total Gasto: <b>${formatBR(totalGasto)}</b></p>
            <p>Economizado: <b style="color:var(--verde-neon)">${formatBR(economizado)}</b></p>
        </div>`;

    list.innerHTML = "<h3>Detalhamento por Categoria</h3>";
    categorias.forEach(c => {
        const itens = filtrados.filter(g => g.categoriaId == c.id);
        if (itens.length > 0) {
            list.innerHTML += `<div style="padding:10px; border-bottom:1px solid #333"><b>${c.nome}</b>: ${formatBR(itens.reduce((a, b) => a + b.valor, 0))}</div>`;
        }
    });
};

// ==========================================
// 8. CONFIGURAÇÕES E NOVO MENU DE NOTIFICAÇÕES (CORRIGIDO)
// ==========================================
window.drawConfiguracoes = function() {
    $("#mainContainer").innerHTML = `
        <div class="card">
            <h3>Plano Financeiro</h3>
            <label>Salário Mensal:</label>
            <input type="number" id="cSal" value="${metaData.salario}" placeholder="Ex: 3500">
            
            <p style="font-size:0.8rem; margin:15px 0 5px; opacity:0.8">Escolha sua prioridade:</p>
            <div style="display:flex; gap:20px; margin-bottom:20px; align-items:center;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
                    <input type="radio" name="st" onclick="window.toggleStrat('tempo')" ${metaData.estrategia==='tempo'?'checked':''}> Definir Prazo
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
                    <input type="radio" name="st" onclick="window.toggleStrat('valor')" ${metaData.estrategia==='valor'?'checked':''}> Definir Valor
                </label>
            </div>

            <div id="cMetaArea"></div>
            <div id="previewInteligente" style="margin-top:15px; padding:12px; background:rgba(57, 255, 20, 0.1); border-radius:8px; color:var(--verde-neon); font-size:0.9rem; font-weight:bold; border:1px dashed var(--verde-neon)"></div>

            <button onclick="window.salvarConfig()" style="width:100%; margin-top:20px; background:var(--verde-neon); color:#000; font-weight:bold; border:none; padding:15px; cursor:pointer; border-radius:8px">SALVAR MEU PLANO</button>
        </div>

        <div class="card">
            <h3>Notificações</h3>
            <div style="display: flex; flex-direction: column; gap: 15px; align-items: flex-start; margin-top: 10px;">
                <label style="display:flex; align-items:center; gap:12px; cursor:pointer; width: 100%; text-align: left;">
                    <input type="checkbox" id="notifLim" ${config.notifs.limite ? 'checked' : ''} onchange="window.saveNotifConfig()" style="width: 18px; height: 18px;"> 
                    <span>Alerta de limite de categorias</span>
                </label>
                <label style="display:flex; align-items:center; gap:12px; cursor:pointer; width: 100%; text-align: left;">
                    <input type="checkbox" id="notifProg" ${config.notifs.progresso ? 'checked' : ''} onchange="window.saveNotifConfig()" style="width: 18px; height: 18px;"> 
                    <span>Alerta de progresso de uso (50%, 75%, 100%)</span>
                </label>
            </div>
        </div>

        <div class="card">
            <h3>Preferências Visuais</h3>
            <p style="font-size:0.8rem; margin-bottom:10px; opacity:0.8">Tipo de Gráfico padrão:</p>
            <div style="display:flex; gap:10px; margin-bottom:20px">
                <button onclick="window.setTipoGrafico('bar')" style="flex:1; background:${config.tipoGrafico === 'bar' ? 'var(--verde-neon)' : '#333'}; color:${config.tipoGrafico === 'bar' ? '#000' : '#fff'}">📊 Barras</button>
                <button onclick="window.setTipoGrafico('pie')" style="flex:1; background:${config.tipoGrafico === 'pie' ? 'var(--verde-neon)' : '#333'}; color:${config.tipoGrafico === 'pie' ? '#000' : '#fff'}">⭕ Pizza</button>
            </div>

            <p style="font-size:0.8rem; margin-bottom:10px; opacity:0.8">Tema do Sistema:</p>
            <button onclick="window.alterarTema('light')">Claro</button>
            <button onclick="window.alterarTema('dark')">Escuro</button>
        </div>`;
    
    window.toggleStrat(metaData.estrategia);
};

window.saveNotifConfig = () => {
    config.notifs.limite = $("#notifLim").checked;
    config.notifs.progresso = $("#notifProg").checked;
    saveAll();
    showToast("Preferências de notificação salvas!");
};

window.setTipoGrafico = (tipo) => {
    config.tipoGrafico = tipo;
    saveAll();
    window.drawConfiguracoes();
    showToast(`Gráficos alterados para ${tipo === 'bar' ? 'Barras' : 'Pizza'}!`);
};

window.toggleStrat = (t) => {
    const area = $("#cMetaArea");
    const preview = $("#previewInteligente");
    metaData.estrategia = t;
    const metaTotal = `<small>Meta Total:</small><input type="number" id="mT" value="${metaData.meta}">`;

    if (t === 'tempo') {
        area.innerHTML = `${metaTotal}<small>Prazo desejado (Meses):</small><input type="number" id="mM" value="${metaData.mesesPrev}">`;
        const calcTempo = () => {
            const m = parseFloat($("#mT").value) || 0;
            const t = parseInt($("#mM").value) || 1;
            preview.innerHTML = `💰 Você precisará guardar: ${formatBR(m / t)} / mês`;
        };
        $("#mM").oninput = calcTempo; $("#mT").oninput = calcTempo;
        calcTempo();
    } else {
        area.innerHTML = `${metaTotal}<small>Quanto quer poupar por mês:</small><input type="number" id="mV" value="${metaData.valorMensal}">`;
        const calcValor = () => {
            const m = parseFloat($("#mT").value) || 0;
            const v = parseFloat($("#mV").value) || 1;
            preview.innerHTML = `⏳ Você atingirá sua meta em: ${Math.ceil(m / v)} meses`;
        };
        $("#mV").oninput = calcValor; $("#mT").oninput = calcValor;
        calcValor();
    }
};

window.salvarConfig = () => {
    metaData.salario = parseFloat($("#cSal").value) || 0;
    metaData.meta = parseFloat($("#mT").value) || 0;
    if(metaData.estrategia === 'tempo') {
        metaData.mesesPrev = parseInt($("#mM").value) || 1;
        metaData.valorMensal = metaData.meta / metaData.mesesPrev;
    } else {
        metaData.valorMensal = parseFloat($("#mV").value) || 0;
        metaData.mesesPrev = Math.ceil(metaData.meta / metaData.valorMensal);
    }
    saveAll();
    showToast("Plano financeiro atualizado!");
    window.drawDashboard();
};

window.alterarTema = (t) => {
    config.tema = t;
    document.body.className = t;
    saveAll();
    // Forçar redesenho caso esteja em uma view com canvas
    const currentView = document.querySelector("nav a.active")?.getAttribute("href") || "";
    window.loadView(currentView);
};

// ==========================================
// 9. NAVEGAÇÃO
// ==========================================
window.loadView = (v) => {
    const rota = v.toLowerCase().replace('#', '').trim();
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href").includes(rota)));
    if(rota.includes('dash') || rota === "") window.drawDashboard();
    else if(rota.includes('gasto')) window.drawGastos();
    else if(rota.includes('ganho')) window.drawGanhos();
    else if(rota.includes('cat')) window.drawCategorias();
    else if(rota.includes('hist')) window.drawHistorico();
    else if(rota.includes('config')) window.drawConfiguracoes();
};

document.addEventListener("click", (el) => {
    const navA = el.target.closest("nav a");
    if (navA) { el.preventDefault(); window.loadView(navA.getAttribute("href")); }
});

window.onload = () => {
    document.body.className = config.tema;
    window.loadView("dashboard");
};
