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
    // ---------- USUARIOS (solo desde JSON, sin defaults) ----------
    const usuariosRemotos = await leerArchivoGitHub('usuarios.json');
    if (Array.isArray(usuariosRemotos) && usuariosRemotos.length > 0) {
        dbUsuarios = usuariosRemotos.filter(u => u && u.usuario && (u.passHash || u.pass));
    } else {
        dbUsuarios = [];
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
        dbTareas = [];
    }
}

async function guardarEnGitHub(rutaArchivo, contenidoObjeto, mensajeCommit) {
    const tokenUsar = tokenAdmin || sessionStorage.getItem('ae_github_token');
    if (!tokenUsar) {
        mostrarToast('Sin token de GitHub: el cambio solo vive en esta sesión.', 'error');
        return false;
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

    if (dbUsuarios.length === 0) {
        alert('No hay usuarios registrados. Crea el primer administrador desde el botón "Crear primer admin".');
        return;
    }

    const encontrado = dbUsuarios.find(u => u.usuario === user);
    if (!encontrado) { alert('Usuario o contraseña incorrectos.'); return; }

    const hashAlmacenado = encontrado.passHash || encontrado.pass || '';
    const esLegado = !encontrado.passHash && encontrado.pass;
    const ok = await verificarPassword(pass, hashAlmacenado);
    if (!ok) { alert('Usuario o contraseña incorrectos.'); return; }

    if (esLegado) {
        encontrado.passHash = await generarHashPassword(pass);
        delete encontrado.pass;
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Migrar contraseña a PBKDF2');
    }

    sesionActual = encontrado;
    sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));
    if (token) { tokenAdmin = token; sessionStorage.setItem('ae_github_token', token); }
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

    const htmlUsuariosAdmin = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
            <div>
                <span class="font-bold">${u.nombre}</span> <span class="text-xs text-blue-600 font-semibold">(${u.usuario})</span> — Rol: <strong>${u.rol}</strong>
            </div>
            <div class="flex gap-2 w-full sm:w-auto">
                <input type="password" id="pass_${u.id}" placeholder="Nueva contraseña" class="flex-1 sm:w-48 px-3 py-1.5 border rounded-lg text-xs">
                <button onclick="actualizarPasswordUser(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold">Resetear</button>
                <button onclick="eliminarUsuarioAdmin(${u.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-semibold">Eliminar</button>
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
                    <span class="text-xs font-bold text-slate-400 uppercase">Usuarios</span>
                    <h3 class="text-3xl font-extrabold text-blue-600 mt-1">${dbUsuarios.length}</h3>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <span class="text-xs font-bold text-slate-400 uppercase">Informes y Exportación</span>
                    <button onclick="exportarCSV()" class="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow transition">📥 Exportar Reporte CSV</button>
                </div>
            </div>

            <!-- Crear nuevo usuario -->
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
                    <select id="nuevoUserArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">
                        ${dbCatalogos.areas.map(a => `<option value="${a}">${a}</option>`).join('')}
                    </select>
                </div>
                <button onclick="crearUsuarioAdmin()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow transition">Crear Usuario</button>
            </div>

            <!-- Gestión de catálogos -->
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

            <!-- Gestión de usuarios -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">👥 Gestión de Usuarios</h3>
                <p class="text-xs text-slate-500">Las contraseñas no son visibles. Solo puedes resetearlas o eliminar el usuario.</p>
                <div class="space-y-3">${htmlUsuariosAdmin || '<p class="text-sm text-slate-400">No hay usuarios.</p>'}</div>
            </div>

            <!-- Control de tareas -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">📋 Control Total de Tareas</h3>
                <div class="space-y-3">${htmlTareasAdmin || '<p class="text-sm text-slate-400">No hay tareas.</p>'}</div>
            </div>
        </div>
    `;
}

// ================= ACCIONES =================
async function crearUsuarioAdmin() {
    const nombre = document.getElementById('nuevoUserNombre').value.trim();
    const usuario = document.getElementById('nuevoUserUsuario').value.trim();
    const pass = document.getElementById('nuevoUserPass').value.trim();
    const rol = document.getElementById('nuevoUserRol').value;
    const area = document.getElementById('nuevoUserArea').value;

    if (!nombre || !usuario || !pass) { mostrarToast('Completa nombre, usuario y contraseña.', 'error'); return; }
    if (pass.length < 8) { mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    if (dbUsuarios.some(u => u.usuario === usuario)) { mostrarToast('Ese usuario ya existe.', 'error'); return; }

    const nuevo = {
        id: Date.now(),
        nombre, usuario,
        passHash: await generarHashPassword(pass),
        rol, area,
        tokenHash: ''
    };
    dbUsuarios.push(nuevo);
    await guardarEnGitHub('usuarios.json', dbUsuarios, `Crear usuario ${usuario}`);
    mostrarToast('Usuario creado.');
    renderizarInterfazPorRol();
}

async function eliminarUsuarioAdmin(id) {
    if (dbUsuarios.length <= 1) { mostrarToast('No puedes eliminar el último usuario.', 'error'); return; }
    const user = dbUsuarios.find(u => u.id === id);
    if (!confirm(`¿Eliminar a ${user?.nombre}?`)) return;
    dbUsuarios = dbUsuarios.filter(u => u.id !== id);
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Eliminar usuario');
    mostrarToast('Usuario eliminado.');
    renderizarInterfazPorRol();
}

async function actualizarPasswordUser(id) {
    const inputPass = document.getElementById(`pass_${id}`);
    const nuevoPass = inputPass.value.trim();
    const user = dbUsuarios.find(u => u.id === id);
    if (!user) return;
    if (!nuevoPass || nuevoPass.length < 8) { mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    user.passHash = await generarHashPassword(nuevoPass);
    delete user.pass;
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Resetear contraseña');
    inputPass.value = '';
    mostrarToast('Contraseña actualizada.');
}

async function agregarTareaEditor() {
    const titulo = document.getElementById('nuevaTareaTitulo').value.trim();
    const area = document.getElementById('nuevaTareaArea').value;
    const proyecto = document.getElementById('nuevaTareaProyecto').value;
    const fechaLimite = document.getElementById('nuevaTareaFecha').value;
    if (!titulo || !fechaLimite) { mostrarToast('Completa el título y la fecha límite.', 'error'); return; }
    dbTareas.push({ id: Date.now(), titulo, area, proyecto, estado: 'Pendiente', avance: 0, fechaLimite, responsable: sesionActual.nombre });
    await guardarEnGitHub('tareas.json', dbTareas, 'Agregar nueva tarea');
    mostrarToast('Tarea agregada.');
    renderizarInterfazPorRol();
}
async function actualizarAvanceTarea(id, nuevoAvance) {
    const tarea = dbTareas.find(t => t.id === id);
    if (tarea) {
        tarea.avance = parseInt(nuevoAvance) || 0;
        if (tarea.avance >= 100) { tarea.avance = 100; tarea.estado = 'Concluida'; }
        else if (tarea.estado === 'Concluida') { tarea.estado = 'Pendiente'; }
        await guardarEnGitHub('tareas.json', dbTareas, 'Actualizar avance');
        renderizarInterfazPorRol();
    }
}
async function toggleConcluirTarea(id) {
    const tarea = dbTareas.find(t => t.id === id);
    if (tarea) {
        tarea.estado = tarea.estado === 'Concluida' ? 'Pendiente' : 'Concluida';
        if (tarea.estado === 'Concluida') tarea.avance = 100;
        await guardarEnGitHub('tareas.json', dbTareas, 'Cambiar estado');
        renderizarInterfazPorRol();
    }
}
async function eliminarTareaAdmin(id) {
    if (confirm('¿Eliminar esta tarea permanentemente?')) {
        dbTareas = dbTareas.filter(t => t.id !== id);
        await guardarEnGitHub('tareas.json', dbTareas, 'Eliminar tarea');
        renderizarInterfazPorRol();
    }
}
async function agregarAreaCatalogo() {
    const area = document.getElementById('nuevoAreaInput').value.trim();
    if (area && !dbCatalogos.areas.includes(area)) {
        dbCatalogos.areas.push(area);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar área');
        mostrarToast('Área agregada.');
        renderizarInterfazPorRol();
    }
}
async function agregarProyectoCatalogo() {
    const proj = document.getElementById('nuevoProyectoInput').value.trim();
    if (proj && !dbCatalogos.proyectos.includes(proj)) {
        dbCatalogos.proyectos.push(proj);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar proyecto');
        mostrarToast('Proyecto agregado.');
        renderizarInterfazPorRol();
    }
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
