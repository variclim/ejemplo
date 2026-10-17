// ================= CONFIG GITHUB =================
const GITHUB_USER = "variclim";
const GITHUB_REPO = "ejemplo";
const GITHUB_BRANCH = "main";

let tokenAdmin = sessionStorage.getItem('ae_github_token') || "";
let sesionActual = JSON.parse(sessionStorage.getItem('ae_sesion')) || null;

let dbUsuarios = [];
let dbCatalogos = {
    areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'],
    proyectos: ['Proyecto General SLP']
};
let dbTareas = [];

// Estado de UI
let tabPrincipal = 'tareas';
let filtroTareas = 'todas';
let mesCalendario = new Date();

const catalogosDefault = {
    areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'],
    proyectos: ['Monitoreo Satelital 2026', 'Atlas de Riesgo Municipal', 'Red Hidrológica Presa San José']
};

// ================= HASH PBKDF2 =================
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEYLEN = 32;

function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuffer(hex) {
    const b = new Uint8Array(hex.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
    return b.buffer;
}
async function generarHashPassword(p) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey("raw", enc.encode(p), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        km, PBKDF2_KEYLEN * 8
    );
    return bufferToHex(salt) + ":" + bufferToHex(bits);
}
async function verificarPassword(p, almacenado) {
    if (!almacenado || !almacenado.includes(":")) return p === almacenado;
    const [saltHex, hashHex] = almacenado.split(":");
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey("raw", enc.encode(p), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: hexToBuffer(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        km, PBKDF2_KEYLEN * 8
    );
    return bufferToHex(bits) === hashHex;
}

// ================= ARRANQUE =================
window.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosDesdeGitHub();
    if (sesionActual) renderizarInterfazPorRol();
});

function mostrarToast(m, tipo = 'success') {
    const t = document.getElementById('toast');
    if (!t) { alert(m); return; }
    t.textContent = m;
    t.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all duration-300 ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3500);
}

// ================= TOKEN GITHUB UI =================
function abrirModalToken() {
    if (sesionActual?.rol !== 'admin') { mostrarToast('Solo el administrador puede editar el token.', 'error'); return; }
    document.getElementById('tokenInput').value = tokenAdmin || '';
    actualizarEstadoTokenModal();
    document.getElementById('modalToken').classList.remove('hidden');
}
function cerrarModalToken() {
    document.getElementById('modalToken').classList.add('hidden');
}
function actualizarEstadoTokenModal() {
    const el = document.getElementById('tokenEstado');
    if (!el) return;
    if (tokenAdmin) {
        el.textContent = '✅ Token configurado';
        el.className = 'text-xs font-semibold text-emerald-600';
    } else {
        el.textContent = '⚠️ Sin token: los cambios no se guardarán en GitHub';
        el.className = 'text-xs font-semibold text-amber-600';
    }
}
function guardarToken() {
    const v = document.getElementById('tokenInput').value.trim();
    if (!v) { mostrarToast('Token vacío.', 'error'); return; }
    tokenAdmin = v;
    sessionStorage.setItem('ae_github_token', v);
    cerrarModalToken();
    renderizarInterfazPorRol();
    mostrarToast('Token guardado en esta sesión.');
}
function borrarToken() {
    tokenAdmin = '';
    sessionStorage.removeItem('ae_github_token');
    cerrarModalToken();
    renderizarInterfazPorRol();
    mostrarToast('Token eliminado.');
}

// ================= GITHUB SYNC =================
async function leerArchivoGitHub(ruta) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}?t=${Date.now()}`;
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
            const d = await res.json();
            return JSON.parse(decodeURIComponent(escape(atob(d.content))));
        }
    } catch (e) { console.log('Error leyendo', ruta, e); }
    return null;
}
async function cargarDatosDesdeGitHub() {
    const u = await leerArchivoGitHub('usuarios.json');
    dbUsuarios = (Array.isArray(u) && u.length > 0) ? u.filter(x => x && x.usuario && (x.passHash || x.pass)) : [];
    const c = await leerArchivoGitHub('areas_proyectos.json');
    dbCatalogos = (c && Array.isArray(c.areas) && c.areas.length > 0) ? c : catalogosDefault;
    const t = await leerArchivoGitHub('tareas.json');
    dbTareas = (Array.isArray(t) && t.length > 0) ? t : [];
}
async function guardarEnGitHub(ruta, obj, msg) {
    const tok = tokenAdmin || sessionStorage.getItem('ae_github_token');
    if (!tok) { mostrarToast('Sin token de GitHub: cambio solo en esta sesión.', 'error'); return false; }
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}`;
    let sha = "";
    try {
        const r = await fetch(url, { headers: { "Authorization": `token ${tok}` } });
        if (r.ok) { const d = await r.json(); sha = d.sha; }
    } catch (e) {}
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
    const res = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, content: content, sha: sha, branch: GITHUB_BRANCH })
    });
    if (res.ok) { mostrarToast('¡Guardado en GitHub!'); return true; }
    mostrarToast('Error al guardar. Revisa tu token.', 'error');
    return false;
}

// ================= LOGIN =================
function abrirModalLogin() { document.getElementById('modalLogin').classList.remove('hidden'); }
function cerrarModalLogin() { document.getElementById('modalLogin').classList.add('hidden'); }

async function procesarLogin() {
    const userEl = document.getElementById('loginUser');
    const passEl = document.getElementById('loginPassword');
    if (!userEl || !passEl) { alert('Error: inputs de login no encontrados.'); return; }

    const user = userEl.value.trim();
    const pass = passEl.value.trim();

    if (dbUsuarios.length === 0) {
        alert('No hay usuarios registrados. Crea el primero desde la consola o el JSON.');
        return;
    }

    const u = dbUsuarios.find(x => x.usuario === user);
    if (!u) { alert('Usuario o contraseña incorrectos.'); return; }

    const ok = await verificarPassword(pass, u.passHash || u.pass || '');
    if (!ok) { alert('Usuario o contraseña incorrectos.'); return; }

    sesionActual = u;
    sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));
    tabPrincipal = 'tareas';
    filtroTareas = 'todas';
    cerrarModalLogin();
    mostrarToast(`¡Bienvenido, ${u.nombre}!`);
    renderizarInterfazPorRol();
}

function cerrarSesion() {
    sessionStorage.removeItem('ae_sesion');
    sesionActual = null;
    location.reload();
}

// ================= PERMISOS / VISIBILIDAD =================
function tareasVisiblesParaUsuario() {
    if (sesionActual.rol === 'admin') return dbTareas;
    if (sesionActual.verTodasAreas === true) return dbTareas;
    return dbTareas.filter(t => t.area === sesionActual.area);
}
function puedeAsignarCualquierArea() {
    return sesionActual.rol === 'admin' || sesionActual.asignarCualquierArea === true;
}
function areasAsignables() {
    return puedeAsignarCualquierArea() ? dbCatalogos.areas : [sesionActual.area];
}

// ================= RENDER PRINCIPAL =================
function renderizarInterfazPorRol() {
    const nav = document.getElementById('navSessionInfo');
    const colores = {
        admin: 'bg-purple-100 text-purple-800',
        editor: 'bg-blue-100 text-blue-800',
        visualizador: 'bg-emerald-100 text-emerald-800'
    };

    // Token: admin edita, editor/visualizador solo ven estado
    const bloqueToken = sesionActual.rol === 'admin'
        ? `<button onclick="abrirModalToken()" class="text-xs font-semibold px-3 py-2 rounded-xl transition ${tokenAdmin ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'}">${tokenAdmin ? '✅ Token' : '⚙️ Token'}</button>`
        : `<span class="text-xs font-semibold px-3 py-2 rounded-xl ${tokenAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${tokenAdmin ? '🟢 Conectado' : '🔴 Desconectado'}</span>`;

    nav.innerHTML = `
        ${bloqueToken}
        <div class="text-right">
            <span class="block text-xs font-bold text-slate-800">${sesionActual.nombre}</span>
            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${colores[sesionActual.rol] || 'bg-slate-100'}">${sesionActual.rol} · ${sesionActual.area || 'Sin área'}</span>
        </div>
        <button onclick="cerrarSesion()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition">Salir</button>
    `;

    const c = document.getElementById('appContainer');
    const tabs = pestañasDisponibles();
    const htmlTabs = tabs.map(t => `
        <button onclick="cambiarTabPrincipal('${t.id}')" class="px-5 py-3 text-sm font-bold rounded-2xl transition ${tabPrincipal === t.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">
            ${t.icono} ${t.nombre}
        </button>
    `).join('');

    let contenido = '';
    if (tabPrincipal === 'tareas') contenido = generarPanelTareas();
    else if (tabPrincipal === 'calendario') contenido = generarPanelCalendario();
    else if (tabPrincipal === 'catalogos') contenido = generarPanelCatalogos();
    else if (tabPrincipal === 'usuarios') contenido = generarPanelUsuarios();

    c.innerHTML = `
        <div class="flex flex-wrap gap-2">${htmlTabs}</div>
        <div class="space-y-6">${contenido}</div>
    `;
}

function pestañasDisponibles() {
    if (sesionActual.rol === 'admin') {
        return [
            { id: 'tareas', nombre: 'Panel de Tareas', icono: '📋' },
            { id: 'calendario', nombre: 'Calendario', icono: '📅' },
            { id: 'catalogos', nombre: 'Catálogos', icono: '📁' },
            { id: 'usuarios', nombre: 'Gestión de Usuarios', icono: '👥' }
        ];
    }
    return [
        { id: 'tareas', nombre: 'Panel de Tareas', icono: '📋' },
        { id: 'calendario', nombre: 'Calendario', icono: '📅' }
    ];
}

function cambiarTabPrincipal(t) { tabPrincipal = t; renderizarInterfazPorRol(); }
function cambiarFiltroTareas(f) { filtroTareas = f; renderizarInterfazPorRol(); }
function cambiarMes(delta) { mesCalendario.setMonth(mesCalendario.getMonth() + delta); renderizarInterfazPorRol(); }

// ================= PANEL: TAREAS =================
function generarPanelTareas() {
    const visibles = tareasVisiblesParaUsuario();
    const esEditor = sesionActual.rol === 'editor';
    const esAdmin = sesionActual.rol === 'admin';

    const filtradas = visibles.filter(t => {
        if (filtroTareas === 'todas') return true;
        if (filtroTareas === 'pendientes') return t.estado !== 'Concluida';
        if (filtroTareas === 'concluidas') return t.estado === 'Concluida';
        return true;
    });

    const tabsFiltro = `
        <div class="flex gap-2 border-b border-slate-200 pb-2">
            ${['todas', 'pendientes', 'concluidas'].map(f => `
                <button onclick="cambiarFiltroTareas('${f}')" class="px-4 py-2 text-xs font-bold rounded-xl transition ${filtroTareas === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                    ${f.charAt(0).toUpperCase() + f.slice(1)} (${f === 'todas' ? visibles.length : f === 'pendientes' ? visibles.filter(x => x.estado !== 'Concluida').length : visibles.filter(x => x.estado === 'Concluida').length})
                </button>
            `).join('')}
        </div>
    `;

    const cards = filtradas.map(t => `
        <div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="flex-1">
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">${t.area}</span>
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 ml-1">${t.proyecto}</span>
                <h4 class="font-bold text-slate-900 text-base mt-2">${t.titulo}</h4>
                <p class="text-xs text-slate-500 mt-0.5">Límite: ${t.fechaLimite} — Responsable: ${t.responsable}</p>
            </div>
            <div class="flex items-center gap-3 w-full sm:w-auto justify-between">
                <div class="text-right">
                    <span class="text-xs font-bold text-slate-700">Avance: ${t.avance}%</span>
                    <div class="w-24 bg-slate-100 h-2 rounded-full mt-1 overflow-hidden">
                        <div class="bg-blue-600 h-full" style="width:${t.avance}%"></div>
                    </div>
                </div>
                ${(esEditor || esAdmin) ? `
                    <input type="number" min="0" max="100" value="${t.avance}" onchange="actualizarAvanceTarea(${t.id}, this.value)" class="w-16 px-2 py-1.5 border rounded-xl text-xs text-center">
                    <button onclick="toggleConcluirTarea(${t.id})" class="px-3 py-1.5 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">${t.estado}</button>
                    ${esAdmin ? `<button onclick="eliminarTareaAdmin(${t.id})" class="bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1.5 rounded-lg">Eliminar</button>` : ''}
                ` : `
                    <span class="px-3 py-1 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${t.estado}</span>
                `}
            </div>
        </div>
    `).join('');

    let formularioNuevaTarea = '';
    if (esEditor || esAdmin) {
        const areas = areasAsignables();
        const puedeElegirArea = puedeAsignarCualquierArea();
        const optionsAreas = areas.map(a => `<option value="${a}">${a}</option>`).join('');
        const optionsProyectos = dbCatalogos.proyectos.map(p => `<option value="${p}">${p}</option>`).join('');
        formularioNuevaTarea = `
            <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h2 class="text-xl font-extrabold text-slate-900">➕ Agregar Nueva Tarea</h2>
                <p class="text-xs text-slate-500">${puedeElegirArea ? '✅ Puedes asignar tareas a cualquier área.' : '🔒 Solo puedes crear tareas en tu área: <strong>' + sesionActual.area + '</strong>.'}</p>
                <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input type="text" id="nuevaTareaTitulo" placeholder="Título de la tarea" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="nuevaTareaArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white" ${puedeElegirArea ? '' : 'disabled'}>${optionsAreas}</select>
                    <select id="nuevaTareaProyecto" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsProyectos}</select>
                    <input type="date" id="nuevaTareaFecha" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="agregarTareaEditor()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow transition">Agregar Nueva Tarea</button>
            </div>
        `;
    }

    const headerInfo = `
        <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
                <h2 class="text-xl font-extrabold text-slate-900">📋 Panel de Tareas</h2>
                <p class="text-sm text-slate-500">
                    ${sesionActual.rol === 'admin' ? 'Ves todas las tareas del sistema.' :
                      sesionActual.verTodasAreas ? 'Ves todas las áreas (permiso especial).' :
                      'Ves solo tareas de tu área: <strong>' + (sesionActual.area || 'Sin área') + '</strong>.'}
                </p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="abrirInformeEjecutivo()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow transition">🖨️ Informe Ejecutivo</button>
                <button onclick="abrirModalExportCSV('tareas')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow transition">📥 Exportar CSV</button>
            </div>
        </div>
    `;

    return `
        <div class="space-y-6">
            ${headerInfo}
            ${formularioNuevaTarea}
            <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                ${tabsFiltro}
                <div class="space-y-3">${cards || '<p class="text-sm text-slate-400">No hay tareas.</p>'}</div>
            </div>
        </div>
    `;
}

// ================= PANEL: CALENDARIO =================
function generarPanelCalendario() {
    const y = mesCalendario.getFullYear();
    const m = mesCalendario.getMonth();
    const primerDia = new Date(y, m, 1);
    const ultimoDia = new Date(y, m + 1, 0);
    const diasMes = ultimoDia.getDate();
    const inicioSemana = primerDia.getDay();
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const diasSem = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const visibles = tareasVisiblesParaUsuario();
    const porFecha = {};
    visibles.forEach(t => {
        if (t.fechaLimite) {
            (porFecha[t.fechaLimite] = porFecha[t.fechaLimite] || []).push(t);
        }
    });

    let celdas = '';
    for (let i = 0; i < inicioSemana; i++) celdas += `<div class="h-24"></div>`;
    for (let d = 1; d <= diasMes; d++) {
        const fechaStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const tareasDia = porFecha[fechaStr] || [];
        const hoy = new Date();
        const esHoy = d === hoy.getDate() && m === hoy.getMonth() && y === hoy.getFullYear();
        celdas += `
            <div class="h-24 border border-slate-100 rounded-lg p-1.5 text-xs ${esHoy ? 'bg-blue-50 border-blue-300' : ''}">
                <div class="font-bold text-slate-700 ${esHoy ? 'text-blue-700' : ''}">${d}</div>
                ${tareasDia.slice(0, 2).map(t => `
                    <div class="mt-0.5 truncate text-[10px] px-1 py-0.5 rounded ${t.estado === 'Concluida' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}" title="${t.titulo} — ${t.area}">${t.titulo}</div>
                `).join('')}
                ${tareasDia.length > 2 ? `<div class="text-[10px] text-slate-400">+${tareasDia.length - 2} más</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
                <h2 class="text-xl font-extrabold text-slate-900 mb-1">📅 Calendario de Tareas</h2>
                <p class="text-sm text-slate-500">
                    ${sesionActual.rol === 'admin' || sesionActual.verTodasAreas ? 'Mostrando todas las áreas.' : 'Mostrando solo tu área: <strong>' + (sesionActual.area || 'Sin área') + '</strong>.'}
                </p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="abrirInformeEjecutivo()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow transition">🖨️ Informe Ejecutivo</button>
                <button onclick="abrirModalExportCSV('calendario')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow transition">📥 Exportar CSV</button>
            </div>
        </div>
        <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div class="flex justify-between items-center">
                <h3 class="font-extrabold text-slate-900">${meses[m]} ${y}</h3>
                <div class="flex gap-2">
                    <button onclick="cambiarMes(-1)" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold">←</button>
                    <button onclick="cambiarMes(1)" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold">→</button>
                </div>
            </div>
            <div class="grid grid-cols-7 gap-1">
                ${diasSem.map(d => `<div class="text-center text-[10px] font-bold text-slate-400 uppercase py-1">${d}</div>`).join('')}
                ${celdas}
            </div>
        </div>
    `;
}

// ================= PANEL: CATÁLOGOS =================
function generarPanelCatalogos() {
    if (sesionActual.rol !== 'admin') return '<p class="text-sm text-rose-600">No tienes acceso a este panel.</p>';
    return `
        <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h2 class="text-xl font-extrabold text-slate-900 mb-1">📁 Catálogos</h2>
            <p class="text-sm text-slate-500">Gestiona las áreas y proyectos disponibles.</p>
        </div>
        <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div class="grid sm:grid-cols-2 gap-6">
                <div class="space-y-3">
                    <label class="block text-sm font-semibold text-slate-700">Nueva Área de Trabajo</label>
                    <div class="flex gap-2">
                        <input type="text" id="nuevoAreaInput" placeholder="Ej. Investigación" class="px-4 py-2 border rounded-xl text-sm w-full">
                        <button onclick="agregarAreaCatalogo()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Agregar</button>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase mb-2">Áreas actuales</p>
                        <div class="flex flex-wrap gap-1">
                            ${dbCatalogos.areas.map(a => `<span class="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded-lg">${a}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="space-y-3">
                    <label class="block text-sm font-semibold text-slate-700">Nuevo Proyecto</label>
                    <div class="flex gap-2">
                        <input type="text" id="nuevoProyectoInput" placeholder="Ej. Inventario Forestal" class="px-4 py-2 border rounded-xl text-sm w-full">
                        <button onclick="agregarProyectoCatalogo()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Agregar</button>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase mb-2">Proyectos actuales</p>
                        <div class="flex flex-wrap gap-1">
                            ${dbCatalogos.proyectos.map(p => `<span class="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-1 rounded-lg">${p}</span>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ================= PANEL: USUARIOS =================
function generarPanelUsuarios() {
    if (sesionActual.rol !== 'admin') return '<p class="text-sm text-rose-600">No tienes acceso a este panel.</p>';

    const htmlUsuarios = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 text-sm">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <span class="font-bold">${u.nombre}</span>
                    <span class="text-xs text-blue-600 font-semibold">(${u.usuario})</span>
                    — <strong>${u.rol}</strong> · Área: <strong>${u.area || 'Sin área'}</strong>
                </div>
                <div class="flex gap-2 w-full sm:w-auto">
                    <input type="password" id="pass_${u.id}" placeholder="Nueva contraseña" class="flex-1 sm:w-48 px-3 py-1.5 border rounded-lg text-xs">
                    <button onclick="actualizarPasswordUser(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">Resetear</button>
                    <button onclick="eliminarUsuarioAdmin(${u.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-semibold">Eliminar</button>
                </div>
            </div>
            <div class="flex flex-wrap gap-4 pt-2 border-t border-slate-100">
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" ${u.verTodasAreas ? 'checked' : ''} onchange="togglePermiso(${u.id}, 'verTodasAreas', this.checked)" class="w-4 h-4">
                    <span>👁️ Ver todas las áreas</span>
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" ${u.asignarCualquierArea ? 'checked' : ''} onchange="togglePermiso(${u.id}, 'asignarCualquierArea', this.checked)" class="w-4 h-4">
                    <span>✏️ Asignar tareas a cualquier área</span>
                </label>
            </div>
        </div>
    `).join('');

    return `
        <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h2 class="text-xl font-extrabold text-slate-900 mb-1">👥 Gestión de Usuarios</h2>
            <p class="text-sm text-slate-500">Crea usuarios, resetea contraseñas y asigna permisos especiales.</p>
        </div>

        <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 class="font-extrabold text-slate-900 text-lg">➕ Crear Nuevo Usuario</h3>
            <div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input type="text" id="nuevoUserNombre" placeholder="Nombre completo" class="px-4 py-2.5 border rounded-xl text-sm">
                <input type="text" id="nuevoUserUsuario" placeholder="Usuario (login)" class="px-4 py-2.5 border rounded-xl text-sm">
                <input type="password" id="nuevoUserPass" placeholder="Contraseña (mín. 8)" class="px-4 py-2.5 border rounded-xl text-sm">
                <select id="nuevoUserRol" class="px-4 py-2.5 border rounded-xl text-sm bg-white">
                    <option value="visualizador">Visualizador</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                </select>
                <select id="nuevoUserArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${dbCatalogos.areas.map(a => `<option value="${a}">${a}</option>`).join('')}</select>
            </div>
            <div class="flex flex-wrap gap-6 pt-2">
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="nuevoUserVerTodas" class="w-4 h-4">
                    <span>👁️ Ver todas las áreas</span>
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="nuevoUserAsignarCualquier" class="w-4 h-4">
                    <span>✏️ Asignar tareas a cualquier área</span>
                </label>
            </div>
            <button onclick="crearUsuarioAdmin()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow">Crear Usuario</button>
        </div>

        <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 class="font-extrabold text-slate-900 text-lg">📋 Usuarios Registrados</h3>
            <div class="space-y-3">${htmlUsuarios || '<p class="text-sm text-slate-400">No hay usuarios.</p>'}</div>
        </div>
    `;
}

// ================= ACCIONES: USUARIOS =================
async function crearUsuarioAdmin() {
    const nombre = document.getElementById('nuevoUserNombre').value.trim();
    const usuario = document.getElementById('nuevoUserUsuario').value.trim();
    const pass = document.getElementById('nuevoUserPass').value.trim();
    const rol = document.getElementById('nuevoUserRol').value;
    const area = document.getElementById('nuevoUserArea').value;
    const verTodasAreas = document.getElementById('nuevoUserVerTodas').checked;
    const asignarCualquierArea = document.getElementById('nuevoUserAsignarCualquier').checked;

    if (!nombre || !usuario || !pass) { mostrarToast('Completa todos los campos.', 'error'); return; }
    if (pass.length < 8) { mostrarToast('Contraseña mínimo 8 caracteres.', 'error'); return; }
    if (dbUsuarios.some(u => u.usuario === usuario)) { mostrarToast('Ese usuario ya existe.', 'error'); return; }

    dbUsuarios.push({
        id: Date.now(),
        nombre, usuario,
        passHash: await generarHashPassword(pass),
        rol, area, verTodasAreas, asignarCualquierArea,
        tokenHash: ''
    });
    await guardarEnGitHub('usuarios.json', dbUsuarios, `Crear usuario ${usuario}`);
    mostrarToast('Usuario creado.');
    renderizarInterfazPorRol();
}
async function eliminarUsuarioAdmin(id) {
    if (dbUsuarios.length <= 1) { mostrarToast('No puedes eliminar el último usuario.', 'error'); return; }
    const u = dbUsuarios.find(x => x.id === id);
    if (!confirm(`¿Eliminar a ${u?.nombre}?`)) return;
    dbUsuarios = dbUsuarios.filter(x => x.id !== id);
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Eliminar usuario');
    mostrarToast('Usuario eliminado.');
    renderizarInterfazPorRol();
}
async function actualizarPasswordUser(id) {
    const inp = document.getElementById(`pass_${id}`);
    const p = inp.value.trim();
    if (!p || p.length < 8) { mostrarToast('Contraseña mínimo 8 caracteres.', 'error'); return; }
    const u = dbUsuarios.find(x => x.id === id);
    if (!u) return;
    u.passHash = await generarHashPassword(p);
    delete u.pass;
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Resetear contraseña');
    inp.value = '';
    mostrarToast('Contraseña actualizada.');
}
async function togglePermiso(id, permiso, valor) {
    const u = dbUsuarios.find(x => x.id === id);
    if (!u) return;
    u[permiso] = valor;
    await guardarEnGitHub('usuarios.json', dbUsuarios, `Actualizar permiso ${permiso} de ${u.usuario}`);
    mostrarToast(`Permiso "${permiso}" ${valor ? 'activado' : 'desactivado'}.`);
}

// ================= ACCIONES: TAREAS =================
async function agregarTareaEditor() {
    const titulo = document.getElementById('nuevaTareaTitulo').value.trim();
    const areaSelect = document.getElementById('nuevaTareaArea');
    const proyecto = document.getElementById('nuevaTareaProyecto').value;
    const fechaLimite = document.getElementById('nuevaTareaFecha').value;

    if (!titulo || !fechaLimite) { mostrarToast('Completa título y fecha.', 'error'); return; }

    const area = areaSelect.disabled ? sesionActual.area : areaSelect.value;

    if (!puedeAsignarCualquierArea() && area !== sesionActual.area) {
        mostrarToast('No tienes permiso para crear tareas en otra área.', 'error');
        return;
    }

    dbTareas.push({
        id: Date.now(), titulo, area, proyecto,
        estado: 'Pendiente', avance: 0, fechaLimite,
        responsable: sesionActual.nombre
    });
    await guardarEnGitHub('tareas.json', dbTareas, 'Agregar tarea');
    mostrarToast('Tarea agregada.');
    renderizarInterfazPorRol();
}
async function actualizarAvanceTarea(id, v) {
    const t = dbTareas.find(x => x.id === id);
    if (!t) return;
    t.avance = parseInt(v) || 0;
    if (t.avance >= 100) { t.avance = 100; t.estado = 'Concluida'; }
    else if (t.estado === 'Concluida') t.estado = 'Pendiente';
    await guardarEnGitHub('tareas.json', dbTareas, 'Actualizar avance');
    renderizarInterfazPorRol();
}
async function toggleConcluirTarea(id) {
    const t = dbTareas.find(x => x.id === id);
    if (!t) return;
    t.estado = t.estado === 'Concluida' ? 'Pendiente' : 'Concluida';
    if (t.estado === 'Concluida') t.avance = 100;
    await guardarEnGitHub('tareas.json', dbTareas, 'Cambiar estado');
    renderizarInterfazPorRol();
}
async function eliminarTareaAdmin(id) {
    if (!confirm('¿Eliminar esta tarea?')) return;
    dbTareas = dbTareas.filter(x => x.id !== id);
    await guardarEnGitHub('tareas.json', dbTareas, 'Eliminar tarea');
    mostrarToast('Tarea eliminada.');
    renderizarInterfazPorRol();
}

// ================= ACCIONES: CATÁLOGOS =================
async function agregarAreaCatalogo() {
    const a = document.getElementById('nuevoAreaInput').value.trim();
    if (!a || dbCatalogos.areas.includes(a)) { mostrarToast('Área inválida o ya existe.', 'error'); return; }
    dbCatalogos.areas.push(a);
    await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar área');
    mostrarToast('Área agregada.');
    renderizarInterfazPorRol();
}
async function agregarProyectoCatalogo() {
    const p = document.getElementById('nuevoProyectoInput').value.trim();
    if (!p || dbCatalogos.proyectos.includes(p)) { mostrarToast('Proyecto inválido o ya existe.', 'error'); return; }
    dbCatalogos.proyectos.push(p);
    await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar proyecto');
    mostrarToast('Proyecto agregado.');
    renderizarInterfazPorRol();
}

// ================= MODAL EXPORTAR CSV =================
function abrirModalExportCSV(origen = 'tareas') {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const y = mesCalendario.getFullYear();
    const m = mesCalendario.getMonth();

    const modal = document.createElement('div');
    modal.id = 'modalExportCSV';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-5">
            <div class="text-center">
                <h3 class="text-xl font-extrabold text-slate-900">📥 Exportar CSV</h3>
                <p class="text-xs text-slate-500 mt-1">Origen: <strong>${origen === 'calendario' ? 'Calendario' : 'Panel de Tareas'}</strong></p>
            </div>
            <div class="space-y-3">
                <label class="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="alcanceCSV" value="mes" checked class="mt-1">
                    <div>
                        <div class="font-semibold text-sm">Mes actual</div>
                        <div class="text-xs text-slate-500">Solo tareas con fecha límite en ${meses[m]} ${y}</div>
                    </div>
                </label>
                <label class="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="alcanceCSV" value="todos" class="mt-1">
                    <div>
                        <div class="font-semibold text-sm">Todos</div>
                        <div class="text-xs text-slate-500">Todas las tareas visibles para tu usuario</div>
                    </div>
                </label>
            </div>
            <div class="flex gap-2">
                <button onclick="cerrarModalExportCSV()" class="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm transition">Cancelar</button>
                <button onclick="ejecutarExportCSV('${origen}')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition shadow">Exportar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
function cerrarModalExportCSV() {
    const m = document.getElementById('modalExportCSV');
    if (m) m.remove();
}
function ejecutarExportCSV(origen) {
    const alcance = document.querySelector('input[name="alcanceCSV"]:checked').value;
    const visibles = tareasVisiblesParaUsuario();
    const y = mesCalendario.getFullYear();
    const m = mesCalendario.getMonth();

    let filtradas = visibles;
    if (alcance === 'mes') {
        filtradas = visibles.filter(t => {
            if (!t.fechaLimite) return false;
            const [yy, mm] = t.fechaLimite.split('-').map(Number);
            return yy === y && (mm - 1) === m;
        });
    }

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreArchivo = `Reporte_${origen}_${alcance === 'mes' ? meses[m] + '_' + y : 'Todos'}.csv`;

    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += `Reporte de ${origen === 'calendario' ? 'Calendario' : 'Tareas'} — ${alcance === 'mes' ? meses[m] + ' ' + y : 'Todos los registros'}\n`;
    csv += `Generado: ${new Date().toLocaleString()}\n`;
    csv += `Usuario: ${sesionActual.nombre} (${sesionActual.rol})\n\n`;
    csv += "ID,Titulo,Area,Proyecto,Estado,Avance,Fecha Limite,Responsable\n";
    filtradas.forEach(t => {
        csv += `${t.id},"${t.titulo}","${t.area}","${t.proyecto}",${t.estado},${t.avance}%,${t.fechaLimite},"${t.responsable}"\n`;
    });

    const a = document.createElement("a");
    a.setAttribute("href", encodeURI(csv));
    a.setAttribute("download", nombreArchivo);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    cerrarModalExportCSV();
    mostrarToast(`CSV exportado: ${filtradas.length} tareas.`);
}

// ================= INFORME EJECUTIVO =================
function abrirInformeEjecutivo() {
    const visibles = tareasVisiblesParaUsuario();
    const total = visibles.length;
    const concluidas = visibles.filter(t => t.estado === 'Concluida').length;
    const pendientes = total - concluidas;
    const avancePromedio = total > 0 ? Math.round(visibles.reduce((s, t) => s + (t.avance || 0), 0) / total) : 0;

    const porArea = {};
    visibles.forEach(t => {
        porArea[t.area] = porArea[t.area] || { total: 0, concluidas: 0, avanceSuma: 0 };
        porArea[t.area].total++;
        if (t.estado === 'Concluida') porArea[t.area].concluidas++;
        porArea[t.area].avanceSuma += (t.avance || 0);
    });

    const porProyecto = {};
    visibles.forEach(t => {
        porProyecto[t.proyecto] = porProyecto[t.proyecto] || { total: 0, concluidas: 0, avanceSuma: 0 };
        porProyecto[t.proyecto].total++;
        if (t.estado === 'Concluida') porProyecto[t.proyecto].concluidas++;
        porProyecto[t.proyecto].avanceSuma += (t.avance || 0);
    });

    const hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const alcance = sesionActual.rol === 'admin' ? 'Todas las áreas (Administrador)' :
                    sesionActual.verTodasAreas ? 'Todas las áreas (permiso especial)' :
                    `Área: ${sesionActual.area || 'Sin área'}`;

    const filasArea = Object.entries(porArea).map(([area, d]) => {
        const prom = Math.round(d.avanceSuma / d.total);
        return `<tr><td>${area}</td><td style="text-align:center">${d.total}</td><td style="text-align:center">${d.concluidas}</td><td style="text-align:center">${d.total - d.concluidas}</td><td style="text-align:center">${prom}%</td></tr>`;
    }).join('');

    const filasProyecto = Object.entries(porProyecto).map(([proy, d]) => {
        const prom = Math.round(d.avanceSuma / d.total);
        return `<tr><td>${proy}</td><td style="text-align:center">${d.total}</td><td style="text-align:center">${d.concluidas}</td><td style="text-align:center">${prom}%</td></tr>`;
    }).join('');

    const filasTareas = visibles.map(t => `
        <tr>
            <td>${t.titulo}</td>
            <td>${t.area}</td>
            <td>${t.proyecto}</td>
            <td>${t.responsable}</td>
            <td style="text-align:center">${t.fechaLimite}</td>
            <td style="text-align:center">${t.estado}</td>
            <td style="text-align:center">${t.avance}%</td>
        </tr>
    `).join('');

    const ventana = window.open('', '_blank');
    ventana.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Informe Ejecutivo — Agenda Institucional</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { font-size: 26px; color: #1e3a8a; margin-bottom: 5px; }
        .header .sub { font-size: 13px; color: #64748b; }
        .meta { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-top: 15px; flex-wrap: wrap; gap: 10px; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
        .kpi { background: #f8fafc; border-left: 4px solid #2563eb; padding: 15px; border-radius: 6px; }
        .kpi .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
        .kpi .value { font-size: 28px; font-weight: 800; color: #1e3a8a; margin-top: 4px; }
        .kpi.verde { border-left-color: #10b981; }
        .kpi.verde .value { color: #047857; }
        .kpi.ambar { border-left-color: #f59e0b; }
        .kpi.ambar .value { color: #b45309; }
        h2 { font-size: 16px; color: #1e3a8a; margin: 30px 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
        th { background: #1e3a8a; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        .no-print { text-align: center; margin: 20px 0; }
        .no-print button { background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .no-print button:hover { background: #1d4ed8; }
        @media print { .no-print { display: none; } body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Informe Ejecutivo — Agenda Institucional</h1>
        <div class="sub">Reporte de avance de tareas y proyectos</div>
        <div class="meta">
            <div><strong>Fecha:</strong> ${hoy}</div>
            <div><strong>Alcance:</strong> ${alcance}</div>
            <div><strong>Generado por:</strong> ${sesionActual.nombre} (${sesionActual.rol})</div>
        </div>
    </div>

    <div class="kpis">
        <div class="kpi"><div class="label">Total Tareas</div><div class="value">${total}</div></div>
        <div class="kpi verde"><div class="label">Concluidas</div><div class="value">${concluidas}</div></div>
        <div class="kpi ambar"><div class="label">Pendientes</div><div class="value">${pendientes}</div></div>
        <div class="kpi"><div class="label">Avance Promedio</div><div class="value">${avancePromedio}%</div></div>
    </div>

    <h2>Resumen por Área</h2>
    <table>
        <thead><tr><th>Área</th><th style="text-align:center">Total</th><th style="text-align:center">Concluidas</th><th style="text-align:center">Pendientes</th><th style="text-align:center">Avance</th></tr></thead>
        <tbody>${filasArea || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>Resumen por Proyecto</h2>
    <table>
        <thead><tr><th>Proyecto</th><th style="text-align:center">Total</th><th style="text-align:center">Concluidas</th><th style="text-align:center">Avance</th></tr></thead>
        <tbody>${filasProyecto || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>Detalle de Tareas</h2>
    <table>
        <thead><tr><th>Título</th><th>Área</th><th>Proyecto</th><th>Responsable</th><th style="text-align:center">Fecha Límite</th><th style="text-align:center">Estado</th><th style="text-align:center">Avance</th></tr></thead>
        <tbody>${filasTareas || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin tareas</td></tr>'}</tbody>
    </table>

    <div class="footer">
        Documento generado automáticamente por la Agenda Electrónica Institucional · ${hoy}
    </div>

    <div class="no-print">
        <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    </div>
</body>
</html>
    `);
    ventana.document.close();
}
