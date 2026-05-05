import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    deleteDoc, 
    onSnapshot, 
    query 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCY1CffzfAdazxL1_SrDNFq0-cVXOr4jWQ",
    authDomain: "customizakb.firebaseapp.com",
    projectId: "customizakb",
    storageBucket: "customizakb.firebasestorage.app",
    messagingSenderId: "632125493513",
    appId: "1:632125493513:web:b00cb9196b8e74eb9a83d8",
    measurementId: "G-41TV2VHHH8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const candidatesCollection = collection(db, "itaiquarakb");

const stages = [
    "Entrevista",
    "Aguardando validação de documento",
    "Aprovado",
    "Exame medico",
    "Assinatura de doc",
    "Prontos para integração"
];

function getGlobalStageNumber(subEtapa) {
    return subEtapa + 1;
}

let candidates = [];
let unsubscribeSnapshot = null;
let currentConfirmCallback = null;
let isViewOnly = false;

// DOM elements
const addBtn = document.getElementById('addEmployeeBtn');
const logoutBtn = document.getElementById('logoutKanbanBtn');
const themeToggle = document.getElementById('themeToggle');
const employeeModal = document.getElementById('employeeModal');
const confirmModal = document.getElementById('confirmModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.querySelector('.loading-text');
const employeeForm = document.getElementById('employeeForm');
const modalTitle = document.getElementById('modalTitle');
const editId = document.getElementById('editId');
const confirmMessageSpan = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYes');
const confirmNoBtn = document.getElementById('confirmNo');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalClose = document.querySelector('.modal-close');
const kanbanBoard = document.getElementById('kanbanBoard');

function setLoading(show, message = 'Carregando...') {
    if (show) {
        loadingText.textContent = message;
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showError(msg) {
    alert(msg);
    console.error(msg);
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

function abrirImagem(base64String, titulo) {
    if (!base64String || !base64String.startsWith('data:image')) {
        alert('Imagem inválida ou não disponível.');
        return;
    }
    try {
        const blob = dataURItoBlob(base64String);
        const url = URL.createObjectURL(blob);
        const newWindow = window.open();
        if (!newWindow) {
            alert('Permita pop-ups para este site para visualizar a imagem.');
            return;
        }
        newWindow.document.write(`<img src="${url}" style="max-width:100%; height:auto;" alt="${titulo}"><p style="text-align:center">${titulo}</p>`);
        newWindow.document.title = titulo;
        setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (error) {
        console.error('Erro ao abrir imagem:', error);
        alert('Erro ao abrir imagem. Verifique se o arquivo foi salvo corretamente.');
    }
}

async function compactarImagem(file, maxBytes = 300 * 1024) {
    return new Promise((resolve, reject) => {
        if (file.size <= maxBytes) {
            resolve(file);
            return;
        }

        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(file);

        img.onload = () => {
            let width = img.width;
            let height = img.height;
            let quality = 0.9;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            function tentarCompactar() {
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    if (blob.size <= maxBytes) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    } else if (quality > 0.2) {
                        quality -= 0.1;
                        tentarCompactar();
                    } else if (width > 100 && height > 100) {
                        width = Math.floor(width * 0.8);
                        height = Math.floor(height * 0.8);
                        quality = 0.8;
                        tentarCompactar();
                    } else {
                        reject(new Error('Não foi possível compactar a imagem para o tamanho desejado'));
                    }
                }, 'image/jpeg', quality);
            }
            tentarCompactar();
        };
        img.onerror = reject;
    });
}

async function addCandidateToFirestore(candidateData) {
    const newId = Date.now().toString();
    const docRef = doc(candidatesCollection, newId);
    await setDoc(docRef, { ...candidateData, id: newId });
}

async function updateCandidateInFirestore(id, updatedData) {
    const docRef = doc(candidatesCollection, id);
    await setDoc(docRef, updatedData, { merge: true });
}

async function deleteCandidateFromFirestore(id) {
    const docRef = doc(candidatesCollection, id);
    await deleteDoc(docRef);
}

function subscribeToCandidates() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const q = query(candidatesCollection);
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        candidates = [];
        snapshot.forEach(doc => candidates.push(doc.data()));
        candidates.sort((a,b) => a.id - b.id);
        renderAllCards();
    }, (error) => {
        console.error("Erro no Firestore:", error);
        showError("Erro ao carregar dados. Verifique as regras do Firestore.");
    });
}

function renderBoard() {
    kanbanBoard.innerHTML = '';
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'columns-container';
    
    stages.forEach((stageName, stageIdx) => {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.dataset.stage = stageIdx;
        const colHeader = document.createElement('div');
        colHeader.className = 'column-header';
        colHeader.innerHTML = `<h3>${stageName}</h3><span class="column-count" id="count-${stageIdx}">0</span>`;
        column.appendChild(colHeader);
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'cards-container';
        cardsContainer.id = `container-${stageIdx}`;
        column.appendChild(cardsContainer);
        columnsContainer.appendChild(column);
    });
    
    kanbanBoard.appendChild(columnsContainer);
    renderAllCards();
    attachEvents();
    attachDragAndDrop();
}

let globalSearchTerm = '';
let globalSortType = 'nome_asc';

function addGlobalControls() {
    const headerActions = document.querySelector('.header-actions');
    if (document.getElementById('globalSearch')) return;
    
    const searchDiv = document.createElement('div');
    searchDiv.className = 'search-box';
    searchDiv.style.marginRight = 'auto';
    searchDiv.innerHTML = `
        <i class="fas fa-search"></i>
        <input type="text" id="globalSearch" placeholder="Buscar por nome..." class="search-input" style="width: 200px;">
    `;
    const sortSelect = document.createElement('select');
    sortSelect.id = 'globalSort';
    sortSelect.className = 'sort-select';
    sortSelect.innerHTML = `
        <option value="nome_asc">Nome A-Z</option>
        <option value="nome_desc">Nome Z-A</option>
        <option value="criacao_asc">Data criação ↑</option>
        <option value="criacao_desc">Data criação ↓</option>
    `;
    headerActions.insertBefore(searchDiv, headerActions.firstChild);
    headerActions.insertBefore(sortSelect, headerActions.firstChild);
    
    document.getElementById('globalSearch').addEventListener('input', (e) => {
        globalSearchTerm = e.target.value;
        renderAllCards();
    });
    document.getElementById('globalSort').addEventListener('change', (e) => {
        globalSortType = e.target.value;
        renderAllCards();
    });
}

function getFilteredAndSorted() {
    let filtered = [...candidates];
    if (globalSearchTerm) {
        const term = globalSearchTerm.toLowerCase();
        filtered = filtered.filter(c => c.nome.toLowerCase().includes(term));
    }
    switch(globalSortType) {
        case 'nome_asc': filtered.sort((a,b) => a.nome.localeCompare(b.nome)); break;
        case 'nome_desc': filtered.sort((a,b) => b.nome.localeCompare(a.nome)); break;
        case 'criacao_asc': filtered.sort((a,b) => new Date(a.dataCriacao) - new Date(b.dataCriacao)); break;
        case 'criacao_desc': filtered.sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao)); break;
        default: filtered.sort((a,b) => a.nome.localeCompare(b.nome));
    }
    return filtered;
}

function renderAllCards() {
    for (let s = 0; s < stages.length; s++) {
        const container = document.getElementById(`container-${s}`);
        if (container) container.innerHTML = '';
        const badge = document.getElementById(`count-${s}`);
        if (badge) badge.innerText = '0';
    }
    
    const filteredList = getFilteredAndSorted();
    const grouped = {};
    filteredList.forEach(cand => {
        const stage = cand.subEtapa !== undefined ? cand.subEtapa : 0;
        if (!grouped[stage]) grouped[stage] = [];
        grouped[stage].push(cand);
    });
    
    for (let s = 0; s < stages.length; s++) {
        const container = document.getElementById(`container-${s}`);
        const badge = document.getElementById(`count-${s}`);
        if (badge) badge.innerText = (grouped[s] || []).length;
        if (container && grouped[s]) {
            grouped[s].forEach(cand => container.appendChild(createCardElement(cand)));
        }
    }
    attachDragAndDrop();
}

function createCardElement(cand) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.id = cand.id;
    let expanded = false;
    const currentStage = cand.subEtapa || 0;
    const hasPrev = currentStage > 0;
    const hasNext = currentStage < stages.length - 1;

    const header = document.createElement('div');
    header.className = 'card-header';
    
    let buttonsHtml = '';
    if (!isViewOnly) {
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="move-btn move-left" ${!hasPrev ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-left"></i></button>
                <button class="move-btn move-right" ${!hasNext ? 'disabled style="opacity:0.4;"' : ''}><i class="fas fa-arrow-right"></i></button>
                <button class="delete-card-btn"><i class="fas fa-trash-alt"></i></button>
                <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
            </div>
        `;
    } else {
        buttonsHtml = `
            <div class="card-actions-row">
                <button class="expand-btn"><i class="fas fa-chevron-down"></i></button>
            </div>
        `;
    }
    header.innerHTML = `
        <div class="card-info">
            <div class="card-nome">${escapeHtml(cand.nome)}</div>
        </div>
        ${buttonsHtml}
    `;
    cardDiv.appendChild(header);

    let rgHtml = '';
    if (cand.rgFrenteBase64) {
        rgHtml += `<div class="detail-row">
            <span class="detail-label">RG Frente</span>
            <span class="detail-value"><button class="btn-view-rg" data-rg="frente" style="background:none; border:none; color:#009688; cursor:pointer; text-decoration:underline;">📄 Visualizar</button></span>
        </div>`;
    }
    if (cand.rgVersoBase64) {
        rgHtml += `<div class="detail-row">
            <span class="detail-label">RG Verso</span>
            <span class="detail-value"><button class="btn-view-rg" data-rg="verso" style="background:none; border:none; color:#009688; cursor:pointer; text-decoration:underline;">📄 Visualizar</button></span>
        </div>`;
    }

    const details = document.createElement('div');
    details.className = 'card-details';
    details.innerHTML = `
        <div class="detail-row"><span class="detail-label">Cargo</span><span class="detail-value">${escapeHtml(cand.cargo || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Expediente</span><span class="detail-value">${cand.inicioExpediente || '—'} às ${cand.fimExpediente || '—'}</span></div>
        ${rgHtml}
        <div class="detail-row"><span class="detail-label">Criado em</span><span class="detail-value">${formatDateTime(cand.dataCriacao)}</span></div>
        <div class="detail-row"><span class="detail-label">Última movimentação</span><span class="detail-value">${formatDateTime(cand.ultimaMovimentacao)}</span></div>
    `;

    if (!isViewOnly) {
        const editDiv = document.createElement('div');
        editDiv.className = 'edit-fields';
        editDiv.style.display = 'none';
        
        const temFrente = !!cand.rgFrenteBase64;
        const temVerso = !!cand.rgVersoBase64;
        
        editDiv.innerHTML = `
            <div class="edit-row">
                <label>Nome completo</label>
                <input type="text" class="edit-nome" value="${escapeHtml(cand.nome)}">
            </div>
            <div class="edit-row">
                <label>Cargo</label>
                <input type="text" class="edit-cargo" value="${escapeHtml(cand.cargo || '')}">
            </div>
            <div class="edit-row">
                <label>Início do expediente</label>
                <input type="time" class="edit-inicio" value="${cand.inicioExpediente || ''}">
            </div>
            <div class="edit-row">
                <label>Término do expediente</label>
                <input type="time" class="edit-fim" value="${cand.fimExpediente || ''}">
            </div>

            <div class="rg-field">
                <div class="rg-status">
                    <span>📄 RG Frente: ${temFrente ? '✅ Presente' : '❌ Ausente'}</span>
                    ${temFrente ? '<button type="button" class="btn-remove-rg" data-rg="frente">Remover</button>' : ''}
                </div>
                <div class="custom-file-upload" data-target="frente">📎 Selecionar imagem (Frente)</div>
                <input type="file" class="edit-rg-frente" accept="image/jpeg,image/png" style="display: none;">
                <span class="file-name" id="file-name-frente"></span>
            </div>

            <div class="rg-field">
                <div class="rg-status">
                    <span>📄 RG Verso: ${temVerso ? '✅ Presente' : '❌ Ausente'}</span>
                    ${temVerso ? '<button type="button" class="btn-remove-rg" data-rg="verso">Remover</button>' : ''}
                </div>
                <div class="custom-file-upload" data-target="verso">📎 Selecionar imagem (Verso)</div>
                <input type="file" class="edit-rg-verso" accept="image/jpeg,image/png" style="display: none;">
                <span class="file-name" id="file-name-verso"></span>
            </div>

            <div class="edit-actions">
                <button class="btn-cancel-edit">Cancelar</button>
                <button class="btn-save-edit">Salvar</button>
            </div>
        `;
        details.appendChild(editDiv);
        
        const editButton = document.createElement('button');
        editButton.className = 'btn-edit-card';
        editButton.textContent = '✎ Editar';
        details.appendChild(editButton);
        
        const editFieldsDiv = editDiv;
        const saveEdit = editFieldsDiv.querySelector('.btn-save-edit');
        const cancelEdit = editFieldsDiv.querySelector('.btn-cancel-edit');
        
        const removeButtons = editFieldsDiv.querySelectorAll('.btn-remove-rg');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rg = btn.dataset.rg;
                if (rg === 'frente') {
                    cand.rgFrenteBase64 = null;
                    const statusSpan = btn.parentElement.querySelector('span');
                    statusSpan.innerHTML = '📄 RG Frente: ❌ Ausente';
                    btn.remove();
                    const fileInput = editFieldsDiv.querySelector('.edit-rg-frente');
                    fileInput.disabled = false;
                    const fileNameSpan = editFieldsDiv.querySelector('#file-name-frente');
                    if (fileNameSpan) fileNameSpan.textContent = '';
                } else {
                    cand.rgVersoBase64 = null;
                    const statusSpan = btn.parentElement.querySelector('span');
                    statusSpan.innerHTML = '📄 RG Verso: ❌ Ausente';
                    btn.remove();
                    const fileInput = editFieldsDiv.querySelector('.edit-rg-verso');
                    fileInput.disabled = false;
                    const fileNameSpan = editFieldsDiv.querySelector('#file-name-verso');
                    if (fileNameSpan) fileNameSpan.textContent = '';
                }
            });
        });
        
        const frenteUploadDiv = editFieldsDiv.querySelector('.custom-file-upload[data-target="frente"]');
        const frenteFileInput = editFieldsDiv.querySelector('.edit-rg-frente');
        const frenteFileName = editFieldsDiv.querySelector('#file-name-frente');
        if (frenteUploadDiv && frenteFileInput) {
            frenteUploadDiv.addEventListener('click', () => frenteFileInput.click());
            frenteFileInput.addEventListener('change', () => {
                if (frenteFileInput.files.length > 0) {
                    frenteFileName.textContent = frenteFileInput.files[0].name;
                } else {
                    frenteFileName.textContent = '';
                }
            });
        }
        
        const versoUploadDiv = editFieldsDiv.querySelector('.custom-file-upload[data-target="verso"]');
        const versoFileInput = editFieldsDiv.querySelector('.edit-rg-verso');
        const versoFileName = editFieldsDiv.querySelector('#file-name-verso');
        if (versoUploadDiv && versoFileInput) {
            versoUploadDiv.addEventListener('click', () => versoFileInput.click());
            versoFileInput.addEventListener('change', () => {
                if (versoFileInput.files.length > 0) {
                    versoFileName.textContent = versoFileInput.files[0].name;
                } else {
                    versoFileName.textContent = '';
                }
            });
        }
        
        editButton.addEventListener('click', () => {
            editFieldsDiv.style.display = 'flex';
            editButton.style.display = 'none';
        });
        
        saveEdit.addEventListener('click', async () => {
            const newNome = editFieldsDiv.querySelector('.edit-nome').value.trim();
            if (!newNome) return;
            cand.nome = newNome;
            cand.cargo = editFieldsDiv.querySelector('.edit-cargo').value;
            cand.inicioExpediente = editFieldsDiv.querySelector('.edit-inicio').value;
            cand.fimExpediente = editFieldsDiv.querySelector('.edit-fim').value;
            
            const rgFrenteFile = editFieldsDiv.querySelector('.edit-rg-frente').files[0];
            const rgVersoFile = editFieldsDiv.querySelector('.edit-rg-verso').files[0];
            
            if (rgFrenteFile) {
                setLoading(true, 'Compactando RG Frente...');
                try {
                    const imagemCompactada = await compactarImagem(rgFrenteFile, 300 * 1024);
                    cand.rgFrenteBase64 = await fileToBase64(imagemCompactada);
                } catch (err) {
                    alert('Erro ao processar RG Frente: ' + err.message);
                    setLoading(false);
                    return;
                }
                setLoading(false);
            }
            if (rgVersoFile) {
                setLoading(true, 'Compactando RG Verso...');
                try {
                    const imagemCompactada = await compactarImagem(rgVersoFile, 300 * 1024);
                    cand.rgVersoBase64 = await fileToBase64(imagemCompactada);
                } catch (err) {
                    alert('Erro ao processar RG Verso: ' + err.message);
                    setLoading(false);
                    return;
                }
                setLoading(false);
            }
            
            await updateCandidateInFirestore(cand.id, cand);
        });
        
        cancelEdit.addEventListener('click', () => {
            editFieldsDiv.style.display = 'none';
            editButton.style.display = 'block';
        });
    }
    
    cardDiv.appendChild(details);

    const viewButtons = cardDiv.querySelectorAll('.btn-view-rg');
    viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.dataset.rg === 'frente') {
                abrirImagem(cand.rgFrenteBase64, `RG Frente - ${cand.nome}`);
            } else {
                abrirImagem(cand.rgVersoBase64, `RG Verso - ${cand.nome}`);
            }
        });
    });

    const expandBtn = header.querySelector('.expand-btn');
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = !expanded;
        if (expanded) cardDiv.classList.add('expanded');
        else cardDiv.classList.remove('expanded');
    });

    if (!isViewOnly) {
        const moveLeft = header.querySelector('.move-left');
        const moveRight = header.querySelector('.move-right');
        const deleteBtn = header.querySelector('.delete-card-btn');
        
        if (moveLeft) {
            moveLeft.addEventListener('click', (e) => {
                e.stopPropagation();
                let newStage = currentStage - 1;
                if (newStage < 0) return;
                const targetStageName = stages[newStage];
                showConfirm(`Mover "${cand.nome}" para a etapa "${targetStageName}"?`, async () => {
                    cand.subEtapa = newStage;
                    cand.ultimaMovimentacao = new Date().toISOString();
                    await updateCandidateInFirestore(cand.id, cand);
                });
            });
        }
        if (moveRight) {
            moveRight.addEventListener('click', (e) => {
                e.stopPropagation();
                let newStage = currentStage + 1;
                if (newStage >= stages.length) return;
                const targetStageName = stages[newStage];
                showConfirm(`Mover "${cand.nome}" para a etapa "${targetStageName}"?`, async () => {
                    cand.subEtapa = newStage;
                    cand.ultimaMovimentacao = new Date().toISOString();
                    await updateCandidateInFirestore(cand.id, cand);
                });
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(`Remover "${cand.nome}" permanentemente?`, async () => await deleteCandidateFromFirestore(cand.id));
            });
        }
    }

    return cardDiv;
}

function attachDragAndDrop() {
    if (isViewOnly) return;
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.setAttribute('draggable', 'true');
        card.removeEventListener('dragstart', dragStart);
        card.removeEventListener('dragend', dragEnd);
        card.addEventListener('dragstart', dragStart);
        card.addEventListener('dragend', dragEnd);
    });
    const containers = document.querySelectorAll('.cards-container');
    containers.forEach(container => {
        container.removeEventListener('dragover', dragOver);
        container.removeEventListener('drop', drop);
        container.addEventListener('dragover', dragOver);
        container.addEventListener('drop', drop);
    });
}

let draggedId = null;
function dragStart(e) {
    draggedId = e.target.closest('.card').dataset.id;
    e.dataTransfer.setData('text/plain', draggedId);
}
function dragEnd() { draggedId = null; }
function dragOver(e) { e.preventDefault(); }
function drop(e) {
    e.preventDefault();
    const targetContainer = e.target.closest('.cards-container');
    if (!targetContainer) return;
    const column = targetContainer.closest('.kanban-column');
    const targetStage = parseInt(column.dataset.stage);
    const candidate = candidates.find(c => c.id == draggedId);
    if (candidate && (candidate.subEtapa !== targetStage)) {
        const targetStageName = stages[targetStage];
        showConfirm(`Mover "${candidate.nome}" para a etapa "${targetStageName}"?`, async () => {
            candidate.subEtapa = targetStage;
            candidate.ultimaMovimentacao = new Date().toISOString();
            await updateCandidateInFirestore(candidate.id, candidate);
        });
    }
}

function attachEvents() {}

function openEmployeeModal(employee = null) {
    if (isViewOnly) return;
    if (employee) {
        modalTitle.innerText = 'Editar candidato';
        editId.value = employee.id;
        document.getElementById('empNome').value = employee.nome;
        document.getElementById('empCargo').value = employee.cargo || '';
        document.getElementById('empInicio').value = employee.inicioExpediente || '';
        document.getElementById('empFim').value = employee.fimExpediente || '';
        document.getElementById('empRgFrente').value = '';
        document.getElementById('empRgVerso').value = '';
    } else {
        modalTitle.innerText = 'Adicionar candidato';
        editId.value = '';
        employeeForm.reset();
        document.getElementById('empCargo').value = '';
        document.getElementById('empInicio').value = '';
        document.getElementById('empFim').value = '';
        document.getElementById('empRgFrente').value = '';
        document.getElementById('empRgVerso').value = '';
    }
    employeeModal.classList.remove('hidden');
}

employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    
    const nome = document.getElementById('empNome').value.trim();
    if (!nome) return;
    const cargo = document.getElementById('empCargo').value;
    const inicioExpediente = document.getElementById('empInicio').value;
    const fimExpediente = document.getElementById('empFim').value;
    const idEdit = editId.value;
    
    const rgFrenteFile = document.getElementById('empRgFrente').files[0];
    const rgVersoFile = document.getElementById('empRgVerso').files[0];
    let rgFrenteBase64 = null;
    let rgVersoBase64 = null;
    
    if (rgFrenteFile) {
        setLoading(true, 'Compactando RG Frente...');
        try {
            const imagemCompactada = await compactarImagem(rgFrenteFile, 300 * 1024);
            rgFrenteBase64 = await fileToBase64(imagemCompactada);
        } catch (err) {
            alert('Erro ao processar RG Frente: ' + err.message);
            setLoading(false);
            return;
        }
        setLoading(false);
    }
    if (rgVersoFile) {
        setLoading(true, 'Compactando RG Verso...');
        try {
            const imagemCompactada = await compactarImagem(rgVersoFile, 300 * 1024);
            rgVersoBase64 = await fileToBase64(imagemCompactada);
        } catch (err) {
            alert('Erro ao processar RG Verso: ' + err.message);
            setLoading(false);
            return;
        }
        setLoading(false);
    }
    
    if (idEdit) {
        const idx = candidates.findIndex(c => c.id == idEdit);
        if (idx !== -1) {
            const cand = candidates[idx];
            cand.nome = nome;
            cand.cargo = cargo;
            cand.inicioExpediente = inicioExpediente;
            cand.fimExpediente = fimExpediente;
            if (rgFrenteBase64) cand.rgFrenteBase64 = rgFrenteBase64;
            if (rgVersoBase64) cand.rgVersoBase64 = rgVersoBase64;
            await updateCandidateInFirestore(cand.id, cand);
        }
    } else {
        const newCandidate = {
            id: Date.now().toString(),
            nome, cargo, inicioExpediente, fimExpediente,
            subEtapa: 0,
            dataCriacao: new Date().toISOString(),
            ultimaMovimentacao: new Date().toISOString(),
            rgFrenteBase64: rgFrenteBase64,
            rgVersoBase64: rgVersoBase64
        };
        await addCandidateToFirestore(newCandidate);
    }
    employeeModal.classList.add('hidden');
});

addBtn.addEventListener('click', () => openEmployeeModal());
cancelModalBtn.addEventListener('click', () => employeeModal.classList.add('hidden'));
modalClose?.addEventListener('click', () => employeeModal.classList.add('hidden'));

function showConfirm(msg, onConfirm) {
    confirmMessageSpan.innerText = msg;
    confirmModal.classList.remove('hidden');
    currentConfirmCallback = onConfirm;
}
confirmYesBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (currentConfirmCallback) currentConfirmCallback();
    currentConfirmCallback = null;
});
confirmNoBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    currentConfirmCallback = null;
});

function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tema';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tema';
    }
}
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i> Tema' : '<i class="fas fa-moon"></i> Tema';
});

function checkAuth() {
    setLoading(true);
    onAuthStateChanged(auth, (user) => {
        setLoading(false);
        if (!user) {
            window.location.href = 'index.html';
        } else {
            // Remove a restrição de somente leitura para todos os usuários
            isViewOnly = false;
            
            // Garante que o botão "Novo Candidato" seja exibido
            addBtn.style.display = 'flex';
            
            addGlobalControls();
            renderBoard();
            subscribeToCandidates();
        }
    });
}

logoutBtn.addEventListener('click', async () => {
    setLoading(true);
    await signOut(auth);
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    window.location.href = 'index.html';
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

document.getElementById('exportExcelBtn').addEventListener('click', () => {
    try {
        const filtered = getFilteredAndSorted();
        if (filtered.length === 0) {
            alert("Nenhum candidato para exportar.");
            return;
        }
        const worksheetData = [
            ["Nome", "Etapa (progresso)", "Cargo", "Início Expediente", "Fim Expediente", "Data Criação", "Última Movimentação"]
        ];
        filtered.forEach(cand => {
            const stageName = stages[cand.subEtapa] || "Etapa inválida";
            const globalStage = getGlobalStageNumber(cand.subEtapa);
            const stageWithProgress = `${stageName} (${globalStage}/${stages.length})`;
            worksheetData.push([
                cand.nome || "",
                stageWithProgress,
                cand.cargo || "",
                cand.inicioExpediente || "",
                cand.fimExpediente || "",
                formatDateTime(cand.dataCriacao),
                formatDateTime(cand.ultimaMovimentacao)
            ]);
        });
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kanban Itaiquara");
        worksheet['!cols'] = [
            {wch:25}, {wch:35}, {wch:20}, {wch:15}, {wch:15}, {wch:18}, {wch:18}
        ];
        const fileName = `itaiquara_kanban_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    } catch (error) {
        console.error("Erro ao exportar Excel:", error);
        alert("Falha ao gerar o arquivo Excel.");
    }
});

initTheme();
checkAuth();