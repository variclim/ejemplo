// ================= CONFIGURACIÓN GITHUB =================
const GITHUB_USER = "variclim";
const GITHUB_REPO = "ejemplo";
const GITHUB_BRANCH = "main";

let tokenAdmin = sessionStorage.getItem('ae_github_token') || "";
let sesionActual = JSON.parse(sessionStorage.getItem('ae_sesion')) || null;

let dbUsuarios = [];
let dbCatalogos = { areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'], proyectos: ['Proyecto General SLP'] };
let dbTareas = [];

const catalogosDefault = {
    areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'],
    proyectos: ['Monitoreo Satelital 2026', 'Atlas de Riesgo Municipal', 'Red Hidrológica Presa San José']
};

const usuarioAdminDefault = [
    { id: 1, usuario: 'admin', pass: 'admin123', rol: 'admin', nombre: 'El mero Chiludon' }
];

window.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosDesdeGitHub();
    if (sesionActual) {
        renderizarInterfazPorRol();
    }
});

function mostrarToast(mensaje, tipo = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = mensaje;
    toast.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all duration-300 ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ================= CARGA Y PERSISTENCIA =================
async function leerArchivoGitHub(ruta) {
    const local = localStorage.getItem(`ae_local_${ruta}`);
    if (local) {
        try { return JSON.parse(local); } catch(e){}
    }

    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const contenido = JSON.parse(decodeURIComponent(escape(atob(data.content))));
            localStorage.setItem(`ae_local_${ruta}`, JSON.stringify(contenido));
            return contenido;
        }
    } catch (e) { console.log(`Usando respaldo para ${ruta}`); }
    return null;
}

async function cargarDatosDesdeGitHub() {
    dbUsuarios = await leerArchivoGitHub('usuarios.json') || usuarioAdminDefault;
    dbCatalogos = await leerArchivoGitHub('areas_proyectos.json') || catalogosDefault;
    dbTareas = await leerArchivoGitHub('tareas.json') || [
        { id: 1, titulo: 'Análisis NDVI Cuenca Alta', area: 'Geomatica', proyecto: 'Monitoreo Satelital 2026', estado: 'Pendiente', avance: 40, fechaLimite: '2026-05-15', responsable: 'Sistema' }
    ];
}

async function guardarEnGitHub(rutaArchivo, contenidoObjeto, mensajeCommit) {
    localStorage.setItem(`ae_local_${rutaArchivo}`, JSON.stringify(contenidoObjeto));

    if (sesionActual?.rol === 'admin' && tokenAdmin) {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${rutaArchivo}`;
        let sha = "";
        try {
            const resGet = await fetch(url, { headers: { "Authorization": `token ${tokenAdmin}` } });
            if (resGet.ok) { const data = await resGet.json(); sha = data.sha; }
        } catch (e) {}

        const contenidoBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(contenidoObjeto, null, 2))));
        const resPut = await fetch(url, {
            method: "PUT",
            headers: { "Authorization": `token ${tokenAdmin}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: mensajeCommit, content: contenidoBase64, sha: sha, branch: GITHUB_BRANCH })
        });

        if (resPut.ok) {
            mostrarToast('¡Sincronizado con GitHub con éxito!');
            return true;
        } else {
            mostrarToast('Guardado local (Token de Admin rechazado en GitHub).', 'error');
            return false;
        }
    } else {
        mostrarToast('Cambios guardados localmente.');
        return true;
    }
}

// ================= AUTENTICACIÓN (LOGIN) =================
function abrirModalLogin() { document.getElementById('modalLogin').classList.remove('hidden'); }
function cerrarModalLogin() { document.getElementById('modalLogin').classList.add('hidden'); }

function procesarLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    const token = document.getElementById('loginTokenGitHub').value.trim();

    const encontrado = dbUsuarios.find(u => u.usuario === user && u.pass === pass);
    
    if (encontrado) {
        sesionActual = encontrado;
        sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));

        if (encontrado.rol === 'admin' && token) {
            tokenAdmin = token;
            sessionStorage.setItem('ae_github_token', token);
        }

        cerrarModalLogin();
        mostrarToast(`¡Bienvenido, ${encontrado.nombre}!`);
        renderizarInterfazPorRol();
    } else {
        alert('Usuario o contraseña incorrectos.');
    }
}

function cerrarSesion() {
    sessionStorage.removeItem('ae_sesion');
    sessionStorage.removeItem('ae_github_token');
    sesionActual = null;
    tokenAdmin = "";
    location.reload();
}

// ================= RENDERIZADO POR ROL =================
function renderizarInterfazPorRol() {
    const navInfo = document.getElementById('navSessionInfo');
    const rolColors = { admin: 'bg-purple-100 text-purple-800', editor: 'bg-blue-100 text-blue-800', visualizador: 'bg-emerald-100 text-emerald-800' };
    
    navInfo.innerHTML = `
        <div class="text-right">
            <span class="block text-xs font-bold text-slate-800">${sesionActual.nombre}</span>
            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${rolColors[sesionActual.rol]}">${sesionActual.rol}</span>
        </div>
        <button onclick="cerrarSesion()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition">Salir</button>
    `;

    const container = document.getElementById('appContainer');
    
    if (sesionActual.rol === 'visualizador') {
        container.innerHTML = generarVistaVisualizador();
    } else if (sesionActual.rol === 'editor') {
        container.innerHTML = generarVistaEditor();
    } else if (sesionActual.rol === 'admin') {
        container.innerHTML = generarVistaAdmin();
    }
}

// ================= VISTA VISUALIZADOR =================
function generarVistaVisualizador() {
    let htmlTareas = dbTareas.map(t => `
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
    let optionsAreas = dbCatalogos.areas.map(a => `<option value="${a}">${a}</option>`).join('');
    let optionsProyectos = dbCatalogos.proyectos.map(p => `<option value="${p}">${p}</option>`).join('');

    let htmlTareasEditor = dbTareas.map(t => `
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

// ================= VISTA ADMINISTRADOR (CORREGIDA Y COMPLETA) =================
function generarVistaAdmin() {
    let htmlTareasAdmin = dbTareas.map(t => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
            <div>
                <span class="font-bold">${t.titulo}</span> <span class="text-xs text-slate-500">(${t.area} / ${t.proyecto}) — Avance: ${t.avance}% — Resp: ${t.responsable}</span>
            </div>
            <button onclick="eliminarTareaAdmin(${t.id})" class="bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1.5 rounded-lg">Eliminar</button>
        </div>
    `).join('');

    let htmlUsuariosAdmin = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
            <div>
                <span class="font-bold">${u.nombre}</span> <span class="text-xs text-blue-600 font-semibold">(${u.usuario})</span> — Rol: <strong class="uppercase text-xs px-2 py-0.5 bg-slate-100 rounded">${u.rol}</strong>
            </div>
            <div class="flex items-center gap-2">
                <input type="text" id="pass_${u.id}" value="${u.pass}" class="w-28 px-2.5 py-1.5 border rounded-xl text-xs" placeholder="Nueva pass">
                <button onclick="actualizarPasswordUser(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">Cambiar</button>
                ${u.rol !== 'admin' ? `<button onclick="eliminarUsuario(${u.id})" class="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-xs font-semibold">Eliminar</button>` : ''}
            </div>
        </div>
    `).join('');

    let optionsAreas = dbCatalogos.areas.map(a => `<option value="${a}">${a}</option>`).join('');
    let optionsProyectos = dbCatalogos.proyectos.map(p => `<option value="${p}">${p}</option>`).join('');

    let htmlTareasAdminCreacion = dbTareas.map(t => `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
            <div>
                <span class="font-bold">${t.titulo}</span> <span class="text-xs text-slate-500">(${t.area} / ${t.proyecto}) — Estado: ${t.estado}</span>
            </div>
            <button onclick="eliminarTareaAdmin(${t.id})" class="bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1.5 rounded-lg">Eliminar</button>
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

            <!-- Módulo de Creación de Usuarios -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <h3 class="font-extrabold text-slate-900 text-lg">➕ Generar Nuevo Usuario y Rol</h3>
                <div class="grid sm:grid-cols-4 gap-3">
                    <input type="text" id="nuevoNombreUser" placeholder="Nombre completo" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="text" id="nuevoUserLogin" placeholder="Usuario (login)" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="password" id="nuevoUserPass" placeholder="Contraseña" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="nuevoUserRol" class="px-4 py-2.5 border rounded-xl text-sm bg-white">
                        <option value="editor">Editor</option>
                        <option value="visualizador">Visualizador</option>
                    </select>
                </div>
                <button onclick="crearNuevoUsuario()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow transition">Crear Usuario</button>
            </div>

            <!-- Gestión de Catálogos (Áreas y Proyectos) -->
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

            <!-- Módulo de Tareas del Administrador -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">📝 Registrar Nueva Tarea</h3>
                <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input type="text" id="adminTareaTitulo" placeholder="Título de la tarea" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="adminTareaArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsAreas}</select>
                    <select id="adminTareaProyecto" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsProyectos}</select>
                    <input type="date" id="adminTareaFecha" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="agregarTareaAdminCreador()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow transition">Guardar Tarea</button>
            </div>

            <!-- Gestión de Usuarios Registrados -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">👥 Gestión de Usuarios Registrados</h3>
                <div class="space-y-3">${htmlUsuariosAdmin}</div>
            </div>

            <!-- Control Total de Tareas -->
            <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-lg">📋 Control Total de Tareas</h3>
                <div class="space-y-3">${htmlTareasAdmin}</div>
            </div>
        </div>
    `;
}

// ================= ACCIONES DE ADMIN Y EDITORES =================
async function crearNuevoUsuario() {
    const nombre = document.getElementById('nuevoNombreUser').value.trim();
    const usuario = document.getElementById('nuevoUserLogin').value.trim();
    const pass = document.getElementById('nuevoUserPass').value.trim();
    const rol = document.getElementById('nuevoUserRol').value;

    if (!nombre || !usuario || !pass) {
        mostrarToast('Completa todos los campos para crear el usuario.', 'error');
        return;
    }

    dbUsuarios.push({ id: Date.now(), nombre, usuario, pass, rol });
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Crear nuevo usuario');
    mostrarToast('Usuario creado con éxito.');
    renderizarInterfazPorRol();
}

async function eliminarUsuario(id) {
    if (confirm('¿Eliminar este usuario permanentemente?')) {
        dbUsuarios = dbUsuarios.filter(u => u.id !== id);
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Eliminar usuario');
        renderizarInterfazPorRol();
    }
}

async function agregarTareaAdminCreador() {
    const titulo = document.getElementById('adminTareaTitulo').value.trim();
    const area = document.getElementById('adminTareaArea').value;
    const proyecto = document.getElementById('adminTareaProyecto').value;
    const fechaLimite = document.getElementById('adminTareaFecha').value;

    if (!titulo || !fechaLimite) {
        mostrarToast('Completa el título y la fecha límite.', 'error');
        return;
    }

    dbTareas.push({ id: Date.now(), titulo, area, proyecto, estado: 'Pendiente', avance: 0, fechaLimite, responsable: 'Administrador' });
    await guardarEnGitHub('tareas.json', dbTareas, 'Agregar tarea por admin');
    mostrarToast('Tarea creada exitosamente.');
    renderizarInterfazPorRol();
}

async function agregarTareaEditor() {
    const titulo = document.getElementById('nuevaTareaTitulo').value.trim();
    const area = document.getElementById('nuevaTareaArea').value;
    const proyecto = document.getElementById('nuevaTareaProyecto').value;
    const fechaLimite = document.getElementById('nuevaTareaFecha').value;

    if (!titulo || !fechaLimite) {
        mostrarToast('Completa el título y la fecha límite.', 'error');
        return;
    }

    dbTareas.push({ id: Date.now(), titulo, area, proyecto, estado: 'Pendiente', avance: 0, fechaLimite, responsable: sesionActual.nombre });
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

async function actualizarPasswordUser(id) {
    const nuevoPass = document.getElementById(`pass_${id}`).value.trim();
    const user = dbUsuarios.find(u => u.id === id);
    if (user && nuevoPass) {
        user.pass = nuevoPass;
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Actualizar password');
        mostrarToast('Contraseña actualizada con éxito.');
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
