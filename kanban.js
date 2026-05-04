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

// Elementos DOM
const addBtn = document.getElementById('addEmployeeBtn');
const logoutBtn = document.getElementById('logoutKanbanBtn');
const themeToggle = document.getElementById('themeToggle');
const employeeModal = document.getElementById('employeeModal');
const confirmModal = document.getElementById('confirmModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const employeeForm = document.getElementById('employeeForm');
const modalTitle = document.getElementById('modalTitle');
const editId = document.getElementById('editId');
const confirmMessageSpan = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYes');
const confirmNoBtn = document.getElementById('confirmNo');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const modalClose = document.querySelector('.modal-close');
const kanbanBoard = document.getElementById('kanbanBoard');

function setLoading(show) {
    if (show) loadingOverlay.classList.remove('hidden');
    else loadingOverlay.classList.add('hidden');
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

    const details = document.createElement('div');
    details.className = 'card-details';
    details.innerHTML = `
        <div class="detail-row"><span class="detail-label">Polo</span><span class="detail-value">${escapeHtml(cand.polo || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Expediente</span><span class="detail-value">${cand.inicioExpediente || '—'} às ${cand.fimExpediente || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Criado em</span><span class="detail-value">${formatDateTime(cand.dataCriacao)}</span></div>
        <div class="detail-row"><span class="detail-label">Última movimentação</span><span class="detail-value">${formatDateTime(cand.ultimaMovimentacao)}</span></div>
    `;

    if (!isViewOnly) {
        const editDiv = document.createElement('div');
        editDiv.className = 'edit-fields';
        editDiv.style.display = 'none';
        editDiv.innerHTML = `
            <input type="text" class="edit-nome" value="${escapeHtml(cand.nome)}">
            <input type="text" class="edit-polo" value="${escapeHtml(cand.polo || '')}">
            <input type="time" class="edit-inicio" value="${cand.inicioExpediente || ''}">
            <input type="time" class="edit-fim" value="${cand.fimExpediente || ''}">
            <div class="edit-actions">
                <button class="btn-save-edit">Salvar</button>
                <button class="btn-cancel-edit">Cancelar</button>
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
        editButton.addEventListener('click', () => {
            editFieldsDiv.style.display = 'flex';
            editButton.style.display = 'none';
        });
        saveEdit.addEventListener('click', async () => {
            const newNome = editFieldsDiv.querySelector('.edit-nome').value.trim();
            if (!newNome) return;
            cand.nome = newNome;
            cand.polo = editFieldsDiv.querySelector('.edit-polo').value;
            cand.inicioExpediente = editFieldsDiv.querySelector('.edit-inicio').value;
            cand.fimExpediente = editFieldsDiv.querySelector('.edit-fim').value;
            await updateCandidateInFirestore(cand.id, cand);
        });
        cancelEdit.addEventListener('click', () => {
            editFieldsDiv.style.display = 'none';
            editButton.style.display = 'block';
        });
    }
    
    cardDiv.appendChild(details);

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
        document.getElementById('empPolo').value = employee.polo || '';
        document.getElementById('empInicio').value = employee.inicioExpediente || '';
        document.getElementById('empFim').value = employee.fimExpediente || '';
    } else {
        modalTitle.innerText = 'Adicionar candidato';
        editId.value = '';
        employeeForm.reset();
        document.getElementById('empPolo').value = '';
        document.getElementById('empInicio').value = '';
        document.getElementById('empFim').value = '';
    }
    employeeModal.classList.remove('hidden');
}

employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    
    const nome = document.getElementById('empNome').value.trim();
    if (!nome) return;
    const polo = document.getElementById('empPolo').value;
    const inicioExpediente = document.getElementById('empInicio').value;
    const fimExpediente = document.getElementById('empFim').value;
    const idEdit = editId.value;
    
    if (idEdit) {
        const idx = candidates.findIndex(c => c.id == idEdit);
        if (idx !== -1) {
            const cand = candidates[idx];
            cand.nome = nome;
            cand.polo = polo;
            cand.inicioExpediente = inicioExpediente;
            cand.fimExpediente = fimExpediente;
            await updateCandidateInFirestore(cand.id, cand);
        }
    } else {
        const newCandidate = {
            id: Date.now().toString(),
            nome, polo, inicioExpediente, fimExpediente,
            subEtapa: 0,
            dataCriacao: new Date().toISOString(),
            ultimaMovimentacao: new Date().toISOString()
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
            isViewOnly = (user.email === "ctz@promptservicos.com.br");
            if (isViewOnly) {
                addBtn.style.display = 'none';
            } else {
                addBtn.style.display = 'flex';
            }
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

// Exportar para Excel
document.getElementById('exportExcelBtn').addEventListener('click', () => {
    try {
        const filtered = getFilteredAndSorted();
        if (filtered.length === 0) {
            alert("Nenhum candidato para exportar.");
            return;
        }
        const worksheetData = [
            ["Nome", "Etapa (progresso)", "Polo", "Início Expediente", "Fim Expediente", "Data Criação", "Última Movimentação"]
        ];
        filtered.forEach(cand => {
            const stageName = stages[cand.subEtapa] || "Etapa inválida";
            const globalStage = getGlobalStageNumber(cand.subEtapa);
            const stageWithProgress = `${stageName} (${globalStage}/${stages.length})`;
            worksheetData.push([
                cand.nome || "",
                stageWithProgress,
                cand.polo || "",
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
            {wch:25}, {wch:35}, {wch:15}, {wch:15}, {wch:15}, {wch:18}, {wch:18}
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