// ================= CONFIGURACIÓN GITHUB =================
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

const catalogosDefault = {
    areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'],
    proyectos: ['Monitoreo Satelital 2026', 'Atlas de Riesgo Municipal', 'Red Hidrológica Presa San José']
};

// ================= UTILIDADES DE HASH (PBKDF2) =================
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEYLEN = 32;

function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes.buffer;
}
async function generarHashPassword(passwordPlano) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(passwordPlano), { name: "PBKDF2" }, false, ["deriveBits"]);
    const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial, PBKDF2_KEYLEN * 8
    );
    return bufferToHex(salt) + ":" + bufferToHex(derivedBits);
}
async function verificarPassword(passwordPlano, almacenado) {
    if (!almacenado || !almacenado.includes(":")) return passwordPlano === almacenado;
    const [saltHex, hashHex] = almacenado.split(":");
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(passwordPlano), { name: "PBKDF2" }, false, ["deriveBits"]);
    const derivedBits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: hexToBuffer(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial, PBKDF2_KEYLEN * 8
    );
    return bufferToHex(derivedBits) === hashHex;
}

// ================= USUARIOS POR DEFECTO (se hashean al arrancar) =================
// Estructura EXACTA que usas: id, nombre, usuario, pass, rol, area, tokenHash
// El campo "pass" aquí es temporal; al arrancar se convierte a "passHash" y se elimina "pass".
const usuariosDefaultRaw = [
    { id: 1,  nombre: 'Administrador General', usuario: 'admin',       pass: 'admin123', rol: 'admin',        area: 'Coordinacion', tokenHash: '' },
    { id: 2,  nombre: 'Visualizador 1',        usuario: 'visualizador1', pass: 'vis123',  rol: 'visualizador', area: 'Coordinacion', tokenHash: '' },
    { id: 3,  nombre: 'Visualizador 2',        usuario: 'visualizador2', pass: 'vis123',  rol: 'visualizador', area: 'Coordinacion', tokenHash: '' },
    { id: 4,  nombre: 'Visualizador 3',        usuario: 'visualizador3', pass: 'vis123',  rol: 'visualizador', area: 'Coordinacion', tokenHash: '' },
    { id: 5,  nombre: 'Visualizador 4',        usuario: 'visualizador4', pass: 'vis123',  rol: 'visualizador', area: 'Coordinacion', tokenHash: '' },
    { id: 6,  nombre: 'Visualizador 5',        usuario: 'visualizador5', pass: 'vis123',  rol: 'visualizador', area: 'Coordinacion', tokenHash: '' },
    { id: 7,  nombre: 'Editor 1',              usuario: 'editor1',      pass: 'edit123', rol: 'editor',       area: 'Sistemas',    tokenHash: '' },
    { id: 8,  nombre: 'Editor 2',              usuario: 'editor2',      pass: 'edit123', rol: 'editor',       area: 'Sistemas',    tokenHash: '' },
    { id: 9,  nombre: 'Editor 3',              usuario: 'editor3',      pass: 'edit123', rol: 'editor',       area: 'Sistemas',    tokenHash: '' },
    { id: 10, nombre: 'Editor 4',              usuario: 'editor4',      pass: 'edit123', rol: 'editor',       area: 'Sistemas',    tokenHash: '' },
    { id: 11, nombre: 'Editor 5',              usuario: 'editor5',      pass: 'edit123', rol: 'editor',       area: 'Sistemas',    tokenHash: '' }
];

// Convierte un array de usuarios con "pass" en texto plano a "passHash"
async function hashearUsuarios(lista) {
    const resultado = [];
    for (const u of lista) {
        const copia = { ...u };
        if (copia.pass && !copia.passHash) {
            copia.passHash = await generarHashPassword(copia.pass);
            delete copia.pass;
        }
        resultado.push(copia);
    }
    return resultado;
}

async function inicializarUsuariosDefault() {
    if (!usuariosDefaultRaw._hashed) {
        usuariosDefaultRaw._hashed = await hashearUsuarios(usuariosDefaultRaw);
    }
    return usuariosDefaultRaw._hashed;
}

// ================= ARRANQUE =================
window.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosDesdeGitHub();
    if (sesionActual) renderizarInterfazPorRol();
});

function mostrarToast(mensaje, tipo = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) { alert(mensaje); return; }
    toast.textContent = mensaje;
    toast.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all duration-300 ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ================= SINCRONIZACIÓN CON GITHUB =================
async function leerArchivoGitHub(ruta) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}?t=${Date.now()}`;
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            return JSON.parse(decodeURIComponent(escape(atob(data.content))));
        }
    } catch (e) { console.log(`Error leyendo ${ruta}`, e); }
    return null;
}

async function cargarDatosDesdeGitHub() {
    // ---------- USUARIOS ----------
    let usuariosRemotos = await leerArchivoGitHub('usuarios.json');
    const usuariosDefaultHasheados = await inicializarUsuariosDefault();

    // Si el JSON está vacío, no es array, o solo tiene objetos sin pass/passHash → usar defaults
    const usuariosRemotosValidos = Array.isArray(usuariosRemotos) && usuariosRemotos.length > 0
        ? usuariosRemotos.filter(u => u && u.usuario && (u.passHash || u.pass))
        : [];

    if (usuariosRemotosValidos.length > 0) {
        // Migración: si viene "pass" en texto plano, hashearlo
        dbUsuarios = await hashearUsuarios(usuariosRemotosValidos);
    } else {
        dbUsuarios = usuariosDefaultHasheados;
    }

    // ---------- CATÁLOGOS ----------
    const catRemotos = await leerArchivoGitHub('areas_proyectos.json');
    if (catRemotos && Array.isArray(catRemotos.areas) && catRemotos.areas.length > 0) {
        dbCatalogos = catRemotos;
    } else {
        dbCatalogos = catalogosDefault;
    }

    // ---------- TAREAS ----------
    const tareasRemotas = await leerArchivoGitHub('tareas.json');
    if (Array.isArray(tareasRemotas) && tareasRemotas.length > 0) {
        dbTareas = tareasRemotas;
    } else {
        dbTareas = [
            { id: 1, titulo: 'Análisis NDVI Cuenca Alta', area: 'Geomatica', proyecto: 'Monitoreo Satelital 2026', estado: 'Pendiente', avance: 40, fechaLimite: '2026-05-15', responsable: 'Editor 1' },
            { id: 2, titulo: 'Calibración Estación Meteorológica', area: 'Meteorologia', proyecto: 'Atlas de Riesgo Municipal', estado: 'Concluida', avance: 100, fechaLimite: '2026-04-10', responsable: 'Editor 2' }
        ];
    }
}

async function guardarEnGitHub(rutaArchivo, contenidoObjeto, mensajeCommit) {
    const tokenUsar = tokenAdmin || sessionStorage.getItem('ae_github_token');
    if (!tokenUsar) {
        // Sin token: solo se guarda en memoria (la sesión actual)
        return true;
    }

    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${rutaArchivo}`;
    let sha = "";
    try {
        const resGet = await fetch(url, { headers: { "Authorization": `token ${tokenUsar}` } });
        if (resGet.ok) { const data = await resGet.json(); sha = data.sha; }
    } catch (e) {}

    const contenidoBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(contenidoObjeto, null, 2))));
    const resPut = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${tokenUsar}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: mensajeCommit, content: contenidoBase64, sha: sha, branch: GITHUB_BRANCH })
    });

    if (resPut.ok) {
        mostrarToast('¡Base de datos en GitHub actualizada!');
        return true;
    } else {
        mostrarToast('Error al sincronizar con GitHub. Verifica tu token.', 'error');
        return false;
    }
}

// ================= AUTENTICACIÓN =================
function abrirModalLogin() { document.getElementById('modalLogin').classList.remove('hidden'); }
function cerrarModalLogin() { document.getElementById('modalLogin').classList.add('hidden'); }

async function procesarLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const token = document.getElementById('loginTokenGitHub').value.trim();

    const encontrado = dbUsuarios.find(u => u.usuario === user);
    if (!encontrado) {
        alert('Usuario o contraseña incorrectos.');
        return;
    }

    // Compatibilidad: passHash (nuevo) o pass (legado)
    const hashAlmacenado = encontrado.passHash || encontrado.pass || '';
    const esLegado = !encontrado.passHash && encontrado.pass;

    const ok = await verificarPassword(pass, hashAlmacenado);
    if (!ok) {
        alert('Usuario o contraseña incorrectos.');
        return;
    }

    // Migración automática si era texto plano
    if (esLegado) {
        encontrado.passHash = await generarHashPassword(pass);
        delete encontrado.pass;
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Migrar contraseña a PBKDF2');
    }

    sesionActual = encontrado;
    sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));
    if (token) {
        tokenAdmin = token;
        sessionStorage.setItem('ae_github_token', token);
    }
    cerrarModalLogin();
    mostrarToast(`¡Bienvenido, ${encontrado.nombre} (${encontrado.rol.toUpperCase()})!`);
    renderizarInterfazPorRol();
}

function cerrarSesion() {
    sessionStorage.removeItem('ae_sesion');
    sesionActual = null;
    location.reload();
}

// ================= RENDERIZADO =================
function renderizarInterfazPorRol() {
    const navInfo = document.getElementById('navSessionInfo');
    const rolColors = { admin: 'bg-purple-100 text-purple-800', editor: 'bg-blue-100 text-blue-800', visualizador: 'bg-emerald-100 text-emerald-800' };

    navInfo.innerHTML = `
        <div class="text-right">
            <span class="block text-xs font-bold text-slate-800">${sesionActual.nombre}</span>
            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${rolColors[sesionActual.rol] || 'bg-slate-100 text-slate-700'}">${sesionActual.rol}</span>
        </div>
        <button onclick="cerrarSesion()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition">Salir</button>
    `;

    const container = document.getElementById('appContainer');
    if (sesionActual.rol === 'visualizador') container.innerHTML = generarVistaVisualizador();
    else if (sesionActual.rol === 'editor') container.innerHTML = generarVistaEditor();
    else if (sesionActual.rol === 'admin') container.innerHTML = generarVistaAdmin();
}

// ================= VISTA VISUALIZADOR =================
function generarVistaVisualizador() {
    const htmlTareas = dbTareas.map(t => `
        <div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">${t.area}</span>
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 ml-1">${t.proyecto}</span>
                <h4 class="font-bold text-slate-900 text-base mt-2">${t.titulo}</h4>
                <p class="text-xs text-slate-500 mt-0.5">Límite: ${t.fechaLimite} — Responsable: ${t.responsable}</p>
            </div>
            <div class="flex items-center gap-4 w-full sm:w-auto justify-between">
                <div class="text-right">
                    <span class="text-xs font-bold text-slate-700">Avance: ${t.avance}%</span>
                    <div class="w-24 bg-slate-100 h-2 rounded-full mt-1 overflow-hidden">
                        <div class="bg-blue-600 h-full" style="width: ${t.avance}%"></div>
                    </div>
                </div>
                <span class="px-3 py-1 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${t.estado}</span>
            </div>
        </div>
    `).join('');

    return `
        <div class="space-y-6">
            <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 class="text-xl font-extrabold text-slate-900">Panel de Visualización</h2>
                <p class="text-sm text-slate-500">Consulta las actividades a realizar, metas y estados actuales en tiempo real.</p>
            </div>
            <div class="space-y-3">${htmlTareas || '<p class="text-sm text-slate-400">No hay tareas registradas.</p>'}</div>
        </div>
    `;
}

// ================= VISTA EDITOR =================
function generarVistaEditor() {
    const optionsAreas = dbCatalogos.areas.map(a => `<option value="${a}">${a}</option>`).join('');
    const optionsProyectos = dbCatalogos.proyectos.map(p => `<option value="${p}">${p}</option>`).join('');

    const htmlTareasEditor = dbTareas.map(t => `
        <div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">${t.area}</span>
                <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 ml-1">${t.proyecto}</span>
                <h4 class="font-bold text-slate-900 text-base mt-2">${t.titulo}</h4>
                <p class="text-xs text-slate-500">Límite: ${t.fechaLimite} — Responsable: ${t.responsable}</p>
            </div>
            <div class="flex items-center gap-3">
                <input type="number" min="0" max="100" value="${t.avance}" onchange="actualizarAvanceTarea(${t.id}, this.value)" class="w-16 px-2 py-1.5 border rounded-xl text-xs text-center">
                <button onclick="toggleConcluirTarea(${t.id})" class="px-3 py-1.5 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">${t.estado}</button>
            </div>
        </div>
    `).join('');

    return `
        <div class="space-y-6">
            <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h2 class="text-xl font-extrabold text-slate-900">Panel de Editor — Agregar Tareas y Actualizar Avances</h2>
                <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input type="text" id="nuevaTareaTitulo" placeholder="Título de la tarea" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="nuevaTareaArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsAreas}</select>
                    <select id="nuevaTareaProyecto" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsProyectos}</select>
                    <input type="date" id="nuevaTareaFecha" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="agregarTareaEditor()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow transition">Agregar Nueva Tarea</button>
            </div>
            <div class="space-y-3">${htmlTareasEditor}</div>
        </div>
    `;
}

// ================= VISTA ADMIN =================
function generarVistaAdmin() {
    const htmlTareasAdmin = dbTareas.map(t => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
            <div>
                <span class="font-bold">${t.titulo}</span> <span class="text-xs text-slate-500">(${t.area} / ${t.proyecto}) — Avance: ${t.avance}%</span>
            </div>
            <button onclick="eliminarTareaAdmin(${t.id})" class="bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1.5 rounded-lg">Eliminar</button>
        </div>
    `).join('');

    // No mostramos la contraseña. Solo permitimos resetear.
    const htmlUsuariosAdmin = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
            <div>
                <span class="font-bold">${u.nombre}</span> <span class="text-xs text-blue-600 font-semibold">(${u.usuario})</span> — Rol: <strong>${u.rol}</strong>
            </div>
            <div class="flex gap-2 w-full sm:w-auto">
                <input type="password" id="pass_${u.id}" placeholder="Nueva contraseña" class="flex-1 sm:w-48 px-3 py-1.5 border rounded-lg text-xs">
                <button onclick="actualizarPasswordUser(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">Resetear</button>
            </div>
        </div>
    `).join('');

    return `
        <div class="space-y-8">
            <div class="grid sm:grid-cols-3 gap-4">
                <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <span class="text-xs font-bold text-slate-400 uppercase">Total Tareas</span>
                    <h3 class="text-3xl font-extrabold text-slate-900 mt-1">${dbTareas.length}</h3>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <span class="text-xs font-bold text-slate-400 uppercase">Tareas Concluidas</span>
                    <h3 class="text-3xl font-extrabold text-emerald-600 mt-1">${dbTareas.filter(t => t.estado === 'Concluida').length}</h3>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <span class="text-xs font-bold text-slate-400 uppercase">Informes y Exportación</span>
                    <button onclick="exportarCSV()" class="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow transition">📥 Exportar Reporte CSV</button>
                </div>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <h3 class="font-extrabold text-slate-900 text-lg">📁 Gestión de Catálogos</h3>
                <div class="grid sm:grid-cols-2 gap-6">
                    <div class="space-y-3">
                        <label class="block text-sm font-semibold text-slate-700">Nueva Área de Trabajo</label>
                        <div class="flex gap-2">
                            <input type="text" id="nuevoAreaInput" placeholder="Ej. Investigación" class="px-4 py-2 border rounded-xl text-sm w-full">
                            <button onclick="agregarAreaCatalogo()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Agregar</button>
                        </div>
                        <p class="text-xs text-slate-500">Áreas actuales: ${dbCatalogos.areas.join(', ')}</p>
                    </div>
                    <div class="space-y-3">
                        <label class="block text-sm font-semibold text-slate-700">Nuevo Proyecto</label>
                        <div class="flex gap-2">
                            <input type="text" id="nuevoProyectoInput" placeholder="Ej. Inventario Forestal" class="px-4 py-2 border rounded-xl text-sm w-full">
                            <button onclick="agregarProyectoCatalogo()" class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Agregar</button>
                        </div>
                        <p class="text-xs text-slate-500">Proyectos actuales: ${dbCatalogos.proyectos.join(', ')}</p>
                    </div>
                </div>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">👥 Gestión de Usuarios (Resetear Contraseña)</h3>
                <p class="text-xs text-slate-500">Por seguridad, las contraseñas no son visibles. Solo puedes asignar una nueva.</p>
                <div class="space-y-3">${htmlUsuariosAdmin}</div>
            </div>

            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">📋 Control Total de Tareas</h3>
                <div class="space-y-3">${htmlTareasAdmin}</div>
            </div>
        </div>
    `;
}

// ================= ACCIONES =================
async function agregarTareaEditor() {
    const titulo = document.getElementById('nuevaTareaTitulo').value.trim();
    const area = document.getElementById('nuevaTareaArea').value;
    const proyecto = document.getElementById('nuevaTareaProyecto').value;
    const fechaLimite = document.getElementById('nuevaTareaFecha').value;

    if (!titulo || !fechaLimite) {
        mostrarToast('Completa el título y la fecha límite.', 'error');
        return;
    }

    dbTareas.push({
        id: Date.now(), titulo, area, proyecto,
        estado: 'Pendiente', avance: 0, fechaLimite,
        responsable: sesionActual.nombre
    });

    await guardarEnGitHub('tareas.json', dbTareas, 'Agregar nueva tarea');
    mostrarToast('Tarea agregada exitosamente.');
    renderizarInterfazPorRol();
}

async function actualizarAvanceTarea(id, nuevoAvance) {
    const tarea = dbTareas.find(t => t.id === id);
    if (tarea) {
        tarea.avance = parseInt(nuevoAvance) || 0;
        if (tarea.avance >= 100) { tarea.avance = 100; tarea.estado = 'Concluida'; }
        else if (tarea.estado === 'Concluida') { tarea.estado = 'Pendiente'; }
        await guardarEnGitHub('tareas.json', dbTareas, 'Actualizar avance de tarea');
        renderizarInterfazPorRol();
    }
}

async function toggleConcluirTarea(id) {
    const tarea = dbTareas.find(t => t.id === id);
    if (tarea) {
        tarea.estado = tarea.estado === 'Concluida' ? 'Pendiente' : 'Concluida';
        if (tarea.estado === 'Concluida') tarea.avance = 100;
        await guardarEnGitHub('tareas.json', dbTareas, 'Cambiar estado de tarea');
        renderizarInterfazPorRol();
    }
}

async function eliminarTareaAdmin(id) {
    if (confirm('¿Eliminar esta tarea permanentemente?')) {
        dbTareas = dbTareas.filter(t => t.id !== id);
        await guardarEnGitHub('tareas.json', dbTareas, 'Eliminar tarea admin');
        renderizarInterfazPorRol();
    }
}

async function agregarAreaCatalogo() {
    const area = document.getElementById('nuevoAreaInput').value.trim();
    if (area && !dbCatalogos.areas.includes(area)) {
        dbCatalogos.areas.push(area);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar nueva área');
        mostrarToast('Área agregada.');
        renderizarInterfazPorRol();
    }
}

async function agregarProyectoCatalogo() {
    const proj = document.getElementById('nuevoProyectoInput').value.trim();
    if (proj && !dbCatalogos.proyectos.includes(proj)) {
        dbCatalogos.proyectos.push(proj);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar nuevo proyecto');
        mostrarToast('Proyecto agregado.');
        renderizarInterfazPorRol();
    }
}

async function actualizarPasswordUser(id) {
    const inputPass = document.getElementById(`pass_${id}`);
    const nuevoPass = inputPass.value.trim();
    const user = dbUsuarios.find(u => u.id === id);
    if (!user) return;
    if (!nuevoPass || nuevoPass.length < 8) {
        mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'error');
        return;
    }
    user.passHash = await generarHashPassword(nuevoPass);
    delete user.pass;
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Resetear contraseña de usuario');
    inputPass.value = '';
    mostrarToast('Contraseña actualizada con éxito.');
}

function exportarCSV() {
    let csv = "data:text/csv;charset=utf-8,\uFEFFReporte de Agenda Institucional\n";
    csv += "ID,Titulo,Area,Proyecto,Estado,Avance,Fecha Limite,Responsable\n";
    dbTareas.forEach(t => {
        csv += `${t.id},"${t.titulo}","${t.area}","${t.proyecto}",${t.estado},${t.avance}%,${t.fechaLimite},"${t.responsable}"\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "Reporte_Agenda_Institucional.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
