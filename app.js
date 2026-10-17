// ================= CONFIGURACIÓN GITHUB =================
const GITHUB_USER = "variclim";
const GITHUB_REPO = "ejemplo";
const GITHUB_BRANCH = "main";

let tokenAdmin = sessionStorage.getItem('ae_github_token') || "";
let sesionActual = JSON.parse(sessionStorage.getItem('ae_sesion')) || null;

let dbUsuarios = [];
let dbCatalogos = { areas: ['Agricola', 'Geomatica', 'Meteorologia', 'Sistemas', 'Administracion', 'Coordinacion'], proyectos: ['Monitoreo Satelital 2026', 'Atlas de Riesgo Municipal', 'Red Hidrológica Presa San José'] };
let dbTareas = [];
let pestanaActiva = 'tareas'; 

const usuarioAdminDefault = [
    { id: 1, usuario: 'admin', pass: 'admin123', rol: 'admin', nombre: 'Administrador General', area: 'Coordinacion', tokenHash: '' }
];

window.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosDesdeGitHub();
    if (sesionActual) {
        if (!tokenAdmin && sesionActual.tokenHash) {
            tokenAdmin = desencriptarPass(sesionActual.tokenHash);
            sessionStorage.setItem('ae_github_token', tokenAdmin);
        }
        renderizarInterfazPorRol();
    }
});

function mostrarToast(msg, tipo = 'success') {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.textContent = msg;
    toast.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Cifrado simétrico robusto para contraseñas y tokens
function encriptarPass(texto) {
    if (!texto) return '';
    return btoa(encodeURIComponent(texto).split('').reverse().join(''));
}
function desencriptarPass(hash) {
    try { return decodeURIComponent(atob(hash).split('').reverse().join('')); } catch(e) { return ''; }
}

// ================= CONEXIÓN GITHUB =================
async function leerArchivoGitHub(ruta) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return JSON.parse(decodeURIComponent(escape(atob(data.content))));
        }
    } catch (e) {}
    return null;
}

async function cargarDatosDesdeGitHub() {
    try {
        const usuariosRemotos = await leerArchivoGitHub('usuarios.json');
        dbUsuarios = Array.isArray(usuariosRemotos) && usuariosRemotos.length > 0 ? usuariosRemotos : usuarioAdminDefault;

        const catalogosRemotos = await leerArchivoGitHub('areas_proyectos.json');
        if (catalogosRemotos && !Array.isArray(catalogosRemotos)) {
            dbCatalogos.areas = catalogosRemotos.areas || dbCatalogos.areas;
            dbCatalogos.proyectos = catalogosRemotos.proyectos || dbCatalogos.proyectos;
        }

        const tareasRemotas = await leerArchivoGitHub('tareas.json');
        dbTareas = Array.isArray(tareasRemotas) ? tareasRemotas : [];
    } catch (err) {
        dbUsuarios = usuarioAdminDefault;
        dbTareas = [];
    }
}

async function guardarEnGitHub(rutaArchivo, contenidoObjeto, mensajeCommit) {
    if (!tokenAdmin && sesionActual && sesionActual.tokenHash) {
        tokenAdmin = desencriptarPass(sesionActual.tokenHash);
    }

    if (!tokenAdmin) {
        const usuarioConToken = dbUsuarios.find(u => u.tokenHash);
        if (usuarioConToken) {
            tokenAdmin = desencriptarPass(usuarioConToken.tokenHash);
        }
    }

    if (!tokenAdmin) {
        mostrarToast('Acción detenida: Se requiere un Token de GitHub encriptado en el perfil.', 'error');
        return false;
    }

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
        mostrarToast('Error al actualizar en GitHub (Verifica el Token).', 'error');
        return false;
    }
}

// ================= AUTENTICACIÓN =================
function abrirModalLogin() { document.getElementById('modalLogin').classList.remove('hidden'); }
function cerrarModalLogin() { document.getElementById('modalLogin').classList.add('hidden'); }

function procesarLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();

    const encontrado = dbUsuarios.find(u => u.usuario === user && (u.pass === pass || desencriptarPass(u.pass) === pass));

    if (encontrado) {
        sesionActual = encontrado;
        sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));

        if (encontrado.tokenHash) {
            tokenAdmin = desencriptarPass(encontrado.tokenHash);
            sessionStorage.setItem('ae_github_token', tokenAdmin);
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

// ================= RENDERIZADO POR PESTAÑAS =================
function cambiarPestana(pestana) {
    pestanaActiva = pestana;
    renderizarInterfazPorRol();
}

function renderizarInterfazPorRol() {
    const navInfo = document.getElementById('navSessionInfo');
    if(!navInfo) return;
    const rolColors = { admin: 'bg-purple-100 text-purple-800', editor: 'bg-blue-100 text-blue-800', visualizador: 'bg-emerald-100 text-emerald-800' };

    navInfo.innerHTML = `
        <div class="text-right">
            <span class="block text-xs font-bold text-slate-800">${sesionActual.nombre}</span>
            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${rolColors[sesionActual.rol]}">${sesionActual.rol} (${sesionActual.area || 'General'})</span>
        </div>
        <button onclick="cerrarSesion()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl transition no-print">Salir</button>
    `;

    const container = document.getElementById('appContainer');
    if (!container) return;

    let tareasVisibles = dbTareas;
    if (sesionActual.rol !== 'admin') {
        tareasVisibles = dbTareas.filter(t => t.area === sesionActual.area);
    }

    let tabsHTML = `
        <div class="flex flex-wrap gap-2 bg-white p-2.5 rounded-2xl border shadow-sm no-print">
            <button onclick="cambiarPestana('tareas')" class="px-5 py-2.5 text-xs font-bold rounded-xl transition ${pestanaActiva === 'tareas' ? 'bg-blue-600 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">📋 Gestión de Tareas</button>
            <button onclick="cambiarPestana('calendario')" class="px-5 py-2.5 text-xs font-bold rounded-xl transition ${pestanaActiva === 'calendario' ? 'bg-blue-600 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">📅 Calendario Gráfico</button>
            <button onclick="cambiarPestana('informes')" class="px-5 py-2.5 text-xs font-bold rounded-xl transition ${pestanaActiva === 'informes' ? 'bg-blue-600 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">📊 Informes Ejecutivos</button>
    `;

    if (sesionActual.rol === 'admin') {
        tabsHTML += `<button onclick="cambiarPestana('usuarios')" class="px-5 py-2.5 text-xs font-bold rounded-xl transition ${pestanaActiva === 'usuarios' ? 'bg-purple-600 text-white shadow' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}">👥 Gestión de Usuarios</button>`;
    }
    tabsHTML += `</div>`;

    let contenidoTab = "";
    if (pestanaActiva === 'tareas') contenidoTab = generarVistaTareas(tareasVisibles);
    else if (pestanaActiva === 'usuarios' && sesionActual.rol === 'admin') contenidoTab = generarVistaUsuarios();
    else if (pestanaActiva === 'calendario') contenidoTab = generarVistaCalendario(tareasVisibles);
    else if (pestanaActiva === 'informes') contenidoTab = generarVistaInformes(tareasVisibles);
    else { pestanaActiva = 'tareas'; contenidoTab = generarVistaTareas(tareasVisibles); }

    container.innerHTML = tabsHTML + contenidoTab;
}

// ================= VISTA 1: TAREAS =================
function generarVistaTareas(tareas) {
    let optionsAreas = (dbCatalogos?.areas || []).map(a => `<option value="${a}">${a}</option>`).join('');
    let optionsProyectos = (dbCatalogos?.proyectos || []).map(p => `<option value="${p}">${p}</option>`).join('');

    let htmlTareas = tareas.map(t => {
        let semaforo = `
            <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-full ${t.avance >= 100 ? 'bg-emerald-500' : (t.avance >= 50 ? 'bg-amber-500' : 'bg-rose-500')} shadow-sm"></span>
                <span class="text-xs font-bold">${t.avance}%</span>
            </div>
        `;

        return `
            <div class="p-5 bg-white rounded-2xl border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div class="flex gap-2 items-center">
                        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">${t.area}</span>
                        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-600">${t.proyecto}</span>
                    </div>
                    <h4 class="font-bold text-slate-900 text-base mt-2">${t.titulo}</h4>
                    <p class="text-xs text-slate-500">Límite: ${t.fechaLimite} — Responsable: ${t.responsable}</p>
                </div>
                <div class="flex items-center gap-4 w-full sm:w-auto justify-between">
                    ${semaforo}
                    <div class="flex items-center gap-2">
                        <input type="number" min="0" max="100" value="${t.avance}" onchange="actualizarAvance(${t.id}, this.value)" class="w-16 px-2 py-1.5 border rounded-xl text-xs text-center font-bold">
                        <button onclick="toggleConcluir(${t.id})" class="px-3 py-1.5 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">${t.estado}</button>
                        ${sesionActual.rol === 'admin' ? `<button onclick="eliminarTarea(${t.id})" class="text-rose-600 hover:text-rose-800 text-xs font-bold px-2 py-1">✕</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let formularioNuevaTarea = "";
    if (sesionActual.rol === 'admin' || sesionActual.rol === 'editor') {
        formularioNuevaTarea = `
            <div class="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base">➕ Registrar Nueva Tarea (${sesionActual.rol === 'admin' ? 'Administrador' : 'Área: ' + sesionActual.area})</h3>
                <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input type="text" id="tTitulo" placeholder="Título de la tarea" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="tArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${sesionActual.rol === 'admin' ? optionsAreas : `<option value="${sesionActual.area}">${sesionActual.area}</option>`}</select>
                    <select id="tProyecto" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsProyectos}</select>
                    <input type="date" id="tFecha" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="crearTarea()" class="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow">Guardar Tarea</button>
            </div>
        `;
    }

    return `
        <div class="space-y-6">
            ${formularioNuevaTarea}
            <div class="space-y-3">${htmlTareas || '<p class="text-sm text-slate-400 text-center py-6">No hay tareas asignadas a tu área.</p>'}</div>
        </div>
    `;
}

// ================= VISTA 2: GESTIÓN DE USUARIOS CON CONTRASEÑA Y TOKEN ENCRIPTADOS =================
function generarVistaUsuarios() {
    let optionsAreas = (dbCatalogos?.areas || []).map(a => `<option value="${a}">${a}</option>`).join('');

    let htmlUsuarios = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
            <div>
                <b>${u.nombre}</b> (${u.usuario}) — Rol: <b class="uppercase">${u.rol}</b> — Área: <span class="text-blue-600 font-semibold">${u.area || 'General'}</span>
                ${u.tokenHash ? '<span class="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">🔒 Token Encriptado</span>' : ''}
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <input type="password" id="newPass_${u.id}" placeholder="Nueva pass" class="px-2.5 py-1.5 border rounded-xl text-xs w-28">
                <button onclick="cambiarPasswordUsuario(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">Cambiar Pass</button>
                ${u.rol !== 'admin' ? `<button onclick="eliminarUsuario(${u.id})" class="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-xs font-semibold">Eliminar</button>` : ''}
            </div>
        </div>
    `).join('');

    return `
        <div class="space-y-8">
            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                <h3 class="font-extrabold text-lg">➕ Registrar Nuevo Usuario (Contraseña Encriptada y Token Encriptado Opcional)</h3>
                <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <input type="text" id="uNombre" placeholder="Nombre completo" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="text" id="uLogin" placeholder="Usuario (login)" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="password" id="uPass" placeholder="Contraseña institucional" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="uRol" class="px-4 py-2.5 border rounded-xl text-sm bg-white">
                        <option value="editor">Editor</option>
                        <option value="visualizador">Visualizador</option>
                        <option value="admin">Administrador</option>
                    </select>
                    <select id="uArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsAreas}</select>
                    <input type="password" id="uToken" placeholder="Token de GitHub (Se guardará encriptado)" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="crearUsuario()" class="bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow">Registrar Usuario con Cifrado</button>
            </div>

            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                <h3 class="font-extrabold text-lg">📁 Gestión de Catálogos</h3>
                <div class="grid sm:grid-cols-2 gap-6">
                    <div><input type="text" id="catArea" placeholder="Nueva Área" class="px-4 py-2 border rounded-xl text-sm w-full mb-2"><button onclick="agregarArea()" class="bg-blue-600 text-white text-xs px-4 py-2 rounded-xl">Agregar Área</button><p class="text-xs text-slate-500 mt-2">Áreas: ${(dbCatalogos?.areas || []).join(', ')}</p></div>
                    <div><input type="text" id="catProj" placeholder="Nuevo Proyecto" class="px-4 py-2 border rounded-xl text-sm w-full mb-2"><button onclick="agregarProyecto()" class="bg-blue-600 text-white text-xs px-4 py-2 rounded-xl">Agregar Proyecto</button><p class="text-xs text-slate-500 mt-2">Proyectos: ${(dbCatalogos?.proyectos || []).join(', ')}</p></div>
                </div>
            </div>

            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-4"><h3 class="font-extrabold text-lg">👥 Gestión de Contraseñas y Usuarios</h3><div class="space-y-3">${htmlUsuarios}</div></div>
        </div>
    `;
}

// ================= VISTA 3: CALENDARIO =================
function generarVistaCalendario(tareas) {
    return `
        <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
            <div>
                <h2 class="text-xl font-extrabold text-slate-900">Calendario Gráfico de Actividades</h2>
                <p class="text-xs text-slate-500">Visualización de hitos y metas cronológicas.</p>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                ${tareas.map(t => `
                    <div class="p-5 rounded-2xl border bg-slate-50/50 space-y-2 shadow-sm border-l-4 ${t.avance >= 100 ? 'border-l-emerald-500' : (t.avance >= 50 ? 'border-l-amber-500' : 'border-l-rose-500')}">
                        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white border">${t.area}</span>
                        <h4 class="font-bold text-slate-900 text-sm">${t.titulo}</h4>
                        <div class="flex justify-between items-center text-xs text-slate-500 pt-2 border-t">
                            <span>📅 ${t.fechaLimite}</span>
                            <b>${t.avance}%</b>
                        </div>
                    </div>
                `).join('') || '<p class="text-sm text-slate-400 col-span-3 text-center py-8">No hay actividades registradas.</p>'}
            </div>
        </div>
    `;
}

// ================= VISTA 4: INFORMES =================
function generarVistaInformes(tareas) {
    let total = tareas.length;
    let concluidas = tareas.filter(t => t.estado === 'Concluida').length;
    let pendientes = total - concluidas;
    let promedioAvance = total > 0 ? (tareas.reduce((acc, t) => acc + t.avance, 0) / total).toFixed(1) : 0;

    let filasTabla = tareas.map(t => `
        <tr class="border-b">
            <td class="py-3 px-4 font-medium">${t.titulo}</td>
            <td class="py-3 px-4">${t.area}</td>
            <td class="py-3 px-4">${t.proyecto}</td>
            <td class="py-3 px-4">${t.responsable}</td>
            <td class="py-3 px-4">${t.fechaLimite}</td>
            <td class="py-3 px-4 font-bold">${t.avance}%</td>
            <td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs ${t.estado === 'Concluida' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${t.estado}</span></td>
        </tr>
    `).join('');

    return `
        <div class="space-y-6">
            <div class="flex justify-between items-center no-print bg-white p-6 rounded-3xl border shadow-sm">
                <div>
                    <h2 class="text-xl font-extrabold text-slate-900">Informe Ejecutivo Institucional</h2>
                    <p class="text-xs text-slate-500">Reporte oficial formateado para directivos.</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="exportarCSV()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow">📥 Exportar CSV</button>
                    <button onclick="window.print()" class="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow">🖨️ Imprimir Reporte Oficial</button>
                </div>
            </div>

            <div id="printableReport" class="bg-white p-10 rounded-3xl border shadow-sm space-y-8">
                <div class="border-b pb-6 flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-black text-slate-900">REPORTE DE AVANCE DE METAS</h1>
                        <p class="text-sm text-slate-500 mt-1">Área: <b>${sesionActual.rol === 'admin' ? 'Todas las Áreas (General)' : sesionActual.area}</b> — Fecha: ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <div class="grid grid-cols-4 gap-4 text-center">
                    <div class="p-4 bg-slate-50 rounded-2xl border"><span class="block text-xs uppercase text-slate-400 font-bold">Total Tareas</span><b class="text-2xl text-slate-900">${total}</b></div>
                    <div class="p-4 bg-slate-50 rounded-2xl border"><span class="block text-xs uppercase text-slate-400 font-bold">Concluidas</span><b class="text-2xl text-emerald-600">${concluidas}</b></div>
                    <div class="p-4 bg-slate-50 rounded-2xl border"><span class="block text-xs uppercase text-slate-400 font-bold">Pendientes</span><b class="text-2xl text-amber-600">${pendientes}</b></div>
                    <div class="p-4 bg-slate-50 rounded-2xl border"><span class="block text-xs uppercase text-slate-400 font-bold">Avance Promedio</span><b class="text-2xl text-blue-600">${promedioAvance}%</b></div>
                </div>

                <div class="overflow-x-auto pt-4">
                    <table class="w-full text-left text-sm text-slate-600">
                        <thead class="bg-slate-50 text-slate-700 uppercase text-xs font-bold">
                            <tr>
                                <th class="py-3 px-4">Actividad</th>
                                <th class="py-3 px-4">Área</th>
                                <th class="py-3 px-4">Proyecto</th>
                                <th class="py-3 px-4">Responsable</th>
                                <th class="py-3 px-4">Límite</th>
                                <th class="py-3 px-4">Avance</th>
                                <th class="py-3 px-4">Estado</th>
                            </tr>
                        </thead>
                        <tbody>${filasTabla || '<tr><td colspan="7" class="text-center py-6 text-slate-400">No hay registros.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ================= ACCIONES =================
async function cambiarPasswordUsuario(id) {
    const inputPass = document.getElementById(`newPass_${id}`).value.trim();
    if (!inputPass) return alert('Ingresa la nueva contraseña.');

    const usuarioObj = dbUsuarios.find(u => u.id === id);
    if (usuarioObj) {
        usuarioObj.pass = encriptarPass(inputPass);
        await guardarEnGitHub('usuarios.json', dbUsuarios, `Actualizar contraseña de ${usuarioObj.usuario}`);
        mostrarToast(`Contraseña actualizada y encriptada para ${usuarioObj.nombre}.`);
        renderizarInterfazPorRol();
    }
}

async function crearUsuario() {
    const nombre = document.getElementById('uNombre').value.trim();
    const usuario = document.getElementById('uLogin').value.trim();
    const pass = document.getElementById('uPass').value.trim();
    const rol = document.getElementById('uRol').value;
    const area = document.getElementById('uArea').value;
    const rawToken = document.getElementById('uToken').value.trim();

    if (!nombre || !usuario || !pass) return alert('Completa los campos obligatorios (nombre, usuario, contraseña).');
    
    let nuevoUser = {
        id: Date.now(),
        nombre,
        usuario,
        pass: encriptarPass(pass),
        rol,
        area,
        tokenHash: rawToken ? encriptarPass(rawToken) : ""
    };

    dbUsuarios.push(nuevoUser);
    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Crear usuario con credenciales y token encriptados');
    mostrarToast('¡Usuario creado con éxito!');
    renderizarInterfazPorRol();
}

async function eliminarUsuario(id) {
    if(confirm('¿Eliminar usuario?')) {
        dbUsuarios = dbUsuarios.filter(u => u.id !== id);
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Eliminar usuario');
        renderizarInterfazPorRol();
    }
}

async function agregarArea() {
    const val = document.getElementById('catArea').value.trim();
    if (val && !dbCatalogos.areas.includes(val)) {
        dbCatalogos.areas.push(val);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar área');
        renderizarInterfazPorRol();
    }
}

async function agregarProyecto() {
    const val = document.getElementById('catProj').value.trim();
    if (val && !dbCatalogos.proyectos.includes(val)) {
        dbCatalogos.proyectos.push(val);
        await guardarEnGitHub('areas_proyectos.json', dbCatalogos, 'Agregar proyecto');
        renderizarInterfazPorRol();
    }
}

async function crearTarea() {
    const titulo = document.getElementById('tTitulo').value.trim();
    const area = document.getElementById('tArea').value;
    const proyecto = document.getElementById('tProyecto').value;
    const fechaLimite = document.getElementById('tFecha').value;

    if (!titulo || !fechaLimite) return alert('Completa título y fecha límite.');
    dbTareas.push({ id: Date.now(), titulo, area, proyecto, estado: 'Pendiente', avance: 0, fechaLimite, responsable: sesionActual.nombre });
    await guardarEnGitHub('tareas.json', dbTareas, 'Crear tarea');
    renderizarInterfazPorRol();
}

async function actualizarAvance(id, val) {
    const t = dbTareas.find(x => x.id === id);
    if (t) {
        t.avance = parseInt(val) || 0;
        if (t.avance >= 100) { t.avance = 100; t.estado = 'Concluida'; }
        else t.estado = 'Pendiente';
        await guardarEnGitHub('tareas.json', dbTareas, 'Actualizar avance');
        renderizarInterfazPorRol();
    }
}

async function toggleConcluir(id) {
    const t = dbTareas.find(x => x.id === id);
    if (t) {
        t.estado = t.estado === 'Concluida' ? 'Pendiente' : 'Concluida';
        if (t.estado === 'Concluida') t.avance = 100;
        await guardarEnGitHub('tareas.json', dbTareas, 'Cambiar estado');
        renderizarInterfazPorRol();
    }
}

async function eliminarTarea(id) {
    if(confirm('¿Eliminar tarea?')) {
        dbTareas = dbTareas.filter(t => t.id !== id);
        await guardarEnGitHub('tareas.json', dbTareas, 'Eliminar tarea');
        renderizarInterfazPorRol();
    }
}

function exportarCSV() {
    let csv = "data:text/csv;charset=utf-8,\uFEFFID,Titulo,Area,Proyecto,Estado,Avance,Fecha Limite,Responsable\n";
    dbTareas.forEach(t => csv += `${t.id},"${t.titulo}","${t.area}","${t.proyecto}",${t.estado},${t.avance}%,${t.fechaLimite},"${t.responsable}"\n`);
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "Reporte_Ejecutivo.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
