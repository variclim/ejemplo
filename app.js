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

// Hash SHA-256 oficial para "admin123"
const usuarioAdminDefault = [
    { id: 1, usuario: 'admin', passHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', rol: 'admin', nombre: 'Administrador General', area: 'Coordinacion', tokenHash: '' }
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
    toast.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all z-[99999] ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ================= SHA-256 ROBUSTO Y DIRECTO =================
function sha256(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return;
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
        var w = words.slice(j, j += 16);
        var oldHash = hash;
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[3]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? '0' : '') + b.toString(16);
        }
    }
    return result;
}

function encriptarPass(texto) {
    if (!texto) return '';
    try { return btoa(encodeURIComponent(texto).split('').reverse().join('')); } catch(e) { return texto; }
}

function desencriptarPass(hash) {
    if (!hash) return '';
    try { 
        if (!/^[A-Za-z0-9+/=]+$/.test(hash)) return hash;
        return decodeURIComponent(atob(hash).split('').reverse().join('')); 
    } catch(e) { return hash; }
}

function sanearTexto(str) {
    if (!str) return '';
    return str.replace(/[<>]/g, '');
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
    if (!tokenAdmin) {
        const adminObj = dbUsuarios.find(u => u.rol === 'admin' && u.tokenHash);
        if (adminObj) { tokenAdmin = desencriptarPass(adminObj.tokenHash); }
    }

    if (!tokenAdmin) {
        mostrarToast('Acción detenida: Se requiere configurar el Token de GitHub del Administrador.', 'error');
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
        mostrarToast('Error al actualizar en GitHub (Verifica tu Token).', 'error');
        return false;
    }
}

// ================= AUTENTICACIÓN =================
function abrirModalLogin() { document.getElementById('modalLogin').classList.remove('hidden'); }
function cerrarModalLogin() { document.getElementById('modalLogin').classList.add('hidden'); }

function procesarLogin() {
    const user = sanearTexto(document.getElementById('loginUser').value.trim());
    const pass = sanearTexto(document.getElementById('loginPassword').value.trim());
    const token = sanearTexto(document.getElementById('loginTokenGitHub').value.trim());

    const encontrado = dbUsuarios.find(u => u.usuario === user);

    if (encontrado) {
        const hashIngresado = sha256(pass);
        
        // Valida contra passHash o respaldo opcional en texto plano
        const esValida = (encontrado.passHash && encontrado.passHash === hashIngresado) || (encontrado.pass && encontrado.pass === pass);

        if (esValida) {
            sesionActual = encontrado;
            sessionStorage.setItem('ae_sesion', JSON.stringify(sesionActual));

            if (token && encontrado.rol === 'admin') {
                tokenAdmin = token;
                sessionStorage.setItem('ae_github_token', token);
                encontrado.tokenHash = encriptarPass(token);
                guardarEnGitHub('usuarios.json', dbUsuarios, 'Guardar token cifrado admin');
            } else if (encontrado.tokenHash) {
                tokenAdmin = desencriptarPass(encontrado.tokenHash);
                sessionStorage.setItem('ae_github_token', tokenAdmin);
            }

            cerrarModalLogin();
            mostrarToast(`¡Bienvenido, ${encontrado.nombre}!`);
            renderizarInterfazPorRol();
            return;
        }
    }
    alert('Usuario o contraseña incorrectos.');
}

function cerrarSesion() {
    sessionStorage.removeItem('ae_sesion');
    sessionStorage.removeItem('ae_github_token');
    sesionActual = null;
    tokenAdmin = "";
    location.reload();
}

// ================= RENDERIZADO Y ROLES =================
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

function generarVistaTareas(tareas) {
    let optionsAreas = (dbCatalogos?.areas || []).map(a => `<option value="${a}">${a}</option>`).join('');
    let optionsProyectos = (dbCatalogos?.proyectos || []).map(p => `<option value="${p}">${p}</option>`).join('');

    let htmlTareas = tareas.map(t => {
        let semaforo = `<div class="flex items-center gap-2"><span class="w-3.5 h-3.5 rounded-full ${t.avance >= 100 ? 'bg-emerald-500' : (t.avance >= 50 ? 'bg-amber-500' : 'bg-rose-500')}"></span><span class="text-xs font-bold">${t.avance}%</span></div>`;

        let controlesAccion = "";
        if (sesionActual.rol === 'visualizador') {
            controlesAccion = `<span class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700">${t.estado}</span>`;
        } else {
            controlesAccion = `
                <div class="flex items-center gap-2">
                    <input type="number" min="0" max="100" value="${t.avance}" onchange="actualizarAvance(${t.id}, this.value)" class="w-16 px-2 py-1.5 border rounded-xl text-xs text-center font-bold">
                    <button onclick="toggleConcluir(${t.id})" class="px-3 py-1.5 text-xs font-semibold rounded-xl ${t.estado === 'Concluida' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}">${t.estado}</button>
                    ${sesionActual.rol === 'admin' ? `<button onclick="eliminarTarea(${t.id})" class="text-rose-600 hover:text-rose-800 text-xs font-bold px-2 py-1">✕</button>` : ''}
                </div>
            `;
        }

        return `
            <div class="p-5 bg-white rounded-2xl border shadow-sm flex justify-between items-center gap-4">
                <div>
                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">${t.area}</span>
                    <h4 class="font-bold text-slate-900 text-base mt-2">${t.titulo}</h4>
                    <p class="text-xs text-slate-500">Límite: ${t.fechaLimite} — Responsable: ${t.responsable}</p>
                </div>
                <div class="flex items-center gap-4">${semaforo}${controlesAccion}</div>
            </div>
        `;
    }).join('');

    let formularioNuevaTarea = "";
    if (sesionActual.rol === 'admin' || sesionActual.rol === 'editor') {
        formularioNuevaTarea = `
            <div class="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base">➕ Registrar Nueva Tarea</h3>
                <div class="grid sm:grid-cols-4 gap-3">
                    <input type="text" id="tTitulo" placeholder="Título de la tarea" maxlength="100" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="tArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${sesionActual.rol === 'admin' ? optionsAreas : `<option value="${sesionActual.area}">${sesionActual.area}</option>`}</select>
                    <select id="tProyecto" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsProyectos}</select>
                    <input type="date" id="tFecha" class="px-4 py-2.5 border rounded-xl text-sm">
                </div>
                <button onclick="crearTarea()" class="bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow">Guardar Tarea</button>
            </div>
        `;
    }

    return `<div class="space-y-6">${formularioNuevaTarea}<div class="space-y-3">${htmlTareas || '<p class="text-sm text-slate-400 text-center py-6">No hay tareas.</p>'}</div></div>`;
}

function generarVistaUsuarios() {
    let optionsAreas = (dbCatalogos?.areas || []).map(a => `<option value="${a}">${a}</option>`).join('');
    const adminActualObj = dbUsuarios.find(u => u.rol === 'admin');
    const tokenConfigurado = adminActualObj && adminActualObj.tokenHash ? "🔒 Token Configurado" : "⚠️ Sin Token";

    let htmlUsuarios = dbUsuarios.map(u => `
        <div class="p-4 bg-white rounded-2xl border flex justify-between items-center text-sm">
            <div><b>${u.nombre}</b> (${u.usuario}) — Rol: <b class="uppercase">${u.rol}</b> — Área: <span class="text-blue-600 font-semibold">${u.area || 'General'}</span></div>
            <div class="flex items-center gap-2">
                <input type="password" id="newPass_${u.id}" placeholder="Nueva pass" maxlength="50" class="px-2.5 py-1.5 border rounded-xl text-xs w-28">
                <button onclick="cambiarPasswordUsuario(${u.id})" class="bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">Cambiar Pass</button>
                ${u.rol !== 'admin' ? `<button onclick="eliminarUsuario(${u.id})" class="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl text-xs font-semibold">Eliminar</button>` : ''}
            </div>
        </div>
    `).join('');

    return `
        <div class="space-y-8">
            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="font-extrabold text-lg text-slate-900">🔑 Token de GitHub del Administrador</h3>
                    <span class="text-xs font-bold px-3 py-1 rounded-full ${adminActualObj?.tokenHash ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${tokenConfigurado}</span>
                </div>
                <div class="flex gap-3">
                    <input type="password" id="adminTokenInput" placeholder="ghp_..." maxlength="100" class="w-full px-4 py-2.5 border rounded-xl text-sm">
                    <button onclick="guardarTokenAdmin()" class="bg-slate-900 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow whitespace-nowrap">Guardar Token</button>
                </div>
            </div>

            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-6">
                <h3 class="font-extrabold text-lg">➕ Registrar Nuevo Usuario</h3>
                <div class="grid sm:grid-cols-4 gap-3">
                    <input type="text" id="uNombre" placeholder="Nombre completo" maxlength="50" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="text" id="uLogin" placeholder="Usuario" maxlength="30" class="px-4 py-2.5 border rounded-xl text-sm">
                    <input type="password" id="uPass" placeholder="Contraseña" maxlength="50" class="px-4 py-2.5 border rounded-xl text-sm">
                    <select id="uRol" class="px-4 py-2.5 border rounded-xl text-sm bg-white"><option value="editor">Editor</option><option value="visualizador">Visualizador</option></select>
                </div>
                <div class="grid sm:grid-cols-2 gap-3 pt-2">
                    <select id="uArea" class="px-4 py-2.5 border rounded-xl text-sm bg-white">${optionsAreas}</select>
                    <button onclick="crearUsuario()" class="bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm shadow">Crear Usuario</button>
                </div>
            </div>

            <div class="bg-white p-8 rounded-3xl border shadow-sm space-y-4"><h3 class="font-extrabold text-lg">👥 Usuarios Registrados</h3><div class="space-y-3">${htmlUsuarios}</div></div>
        </div>
    `;
}

function generarVistaCalendario(tareas) {
    const tareasOrdenadas = [...tareas].sort((a, b) => new Date(a.fechaLimite) - new Date(b.fechaLimite));
    let htmlTarjetas = tareasOrdenadas.map(t => `
        <div class="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3 border-l-8 ${t.avance >= 100 ? 'border-l-emerald-500' : 'border-l-amber-500'}">
            <span class="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">${t.area}</span>
            <h4 class="font-extrabold text-slate-900 text-base mt-1">${t.titulo}</h4>
            <div class="flex justify-between items-center text-xs text-slate-500 pt-2 border-t">
                <span>📅 Límite: ${t.fechaLimite}</span>
                <b>Avance: ${t.avance}%</b>
            </div>
        </div>
    `).join('');
    return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${htmlTarjetas || '<p class="text-sm text-slate-400 col-span-3 text-center py-12 bg-white rounded-3xl border">No hay actividades.</p>'}</div>`;
}

function generarVistaInformes(tareas) {
    let total = tareas.length;
    let concluidas = tareas.filter(t => t.estado === 'Concluida').length;
    let promedioAvance = total > 0 ? (tareas.reduce((acc, t) => acc + t.avance, 0) / total).toFixed(1) : 0;
    
    let botonesAccion = sesionActual.rol === 'admin' ? `<button onclick="window.print()" class="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow">🖨️ Imprimir Reporte</button>` : '';

    return `
        <div class="bg-white p-10 rounded-3xl border shadow-sm space-y-8" id="printableReport">
            <h2 class="text-2xl font-black text-slate-900">REPORTE EJECUTIVO</h2>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div class="p-4 bg-slate-50 rounded-2xl border"><b class="text-2xl">${total}</b><span class="block text-xs uppercase text-slate-400">Total</span></div>
                <div class="p-4 bg-slate-50 rounded-2xl border"><b class="text-2xl text-emerald-600">${concluidas}</b><span class="block text-xs uppercase text-slate-400">Concluidas</span></div>
                <div class="p-4 bg-slate-50 rounded-2xl border"><b class="text-2xl text-blue-600">${promedioAvance}%</b><span class="block text-xs uppercase text-slate-400">Promedio</span></div>
            </div>
            <div class="no-print pt-4">${botonesAccion}</div>
        </div>
    `;
}

async function guardarTokenAdmin() {
    const rawToken = sanearTexto(document.getElementById('adminTokenInput').value.trim());
    if (!rawToken) return alert('Ingresa un token válido.');
    const adminObj = dbUsuarios.find(u => u.rol === 'admin');
    if (adminObj) {
        adminObj.tokenHash = encriptarPass(rawToken);
        tokenAdmin = rawToken;
        sessionStorage.setItem('ae_github_token', tokenAdmin);
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Actualizar token admin');
        mostrarToast('¡Token guardado con éxito!');
        renderizarInterfazPorRol();
    }
}

async function cambiarPasswordUsuario(id) {
    const inputPass = sanearTexto(document.getElementById(`newPass_${id}`).value.trim());
    if (!inputPass) return alert('Ingresa la nueva contraseña.');
    const usuarioObj = dbUsuarios.find(u => u.id === id);
    if (usuarioObj) {
        usuarioObj.passHash = sha256(inputPass);
        delete usuarioObj.pass;
        await guardarEnGitHub('usuarios.json', dbUsuarios, `Actualizar contraseña SHA-256 de ${usuarioObj.usuario}`);
        mostrarToast(`Contraseña actualizada con SHA-256 para ${usuarioObj.nombre}.`);
        renderizarInterfazPorRol();
    }
}

async function crearUsuario() {
    if (sesionActual.rol !== 'admin') return alert('No autorizado.');
    const nombre = sanearTexto(document.getElementById('uNombre').value.trim());
    const usuario = sanearTexto(document.getElementById('uLogin').value.trim());
    const pass = sanearTexto(document.getElementById('uPass').value.trim());
    const rol = document.getElementById('uRol').value;
    const area = document.getElementById('uArea').value;

    if (!nombre || !usuario || !pass) return alert('Completa todos los campos.');

    const passHash = sha256(pass);

    dbUsuarios.push({
        id: Date.now(),
        nombre,
        usuario,
        passHash,
        rol,
        area,
        tokenHash: ""
    });

    await guardarEnGitHub('usuarios.json', dbUsuarios, 'Crear usuario con SHA-256');
    mostrarToast('Usuario creado correctamente.');
    renderizarInterfazPorRol();
}

async function eliminarUsuario(id) {
    if (sesionActual.rol !== 'admin') return;
    if (confirm('¿Eliminar usuario?')) {
        dbUsuarios = dbUsuarios.filter(u => u.id !== id);
        await guardarEnGitHub('usuarios.json', dbUsuarios, 'Eliminar usuario');
        renderizarInterfazPorRol();
    }
}

async function crearTarea() {
    const titulo = sanearTexto(document.getElementById('tTitulo').value.trim());
    const area = sesionActual.rol === 'admin' ? document.getElementById('tArea').value : sesionActual.area;
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
        t.estado = t.avance >= 100 ? 'Concluida' : 'Pendiente';
        await guardarEnGitHub('tareas.json', dbTareas, 'Actualizar avance');
        renderizarInterfazPorRol();
    }
}

async function toggleConcluir(id) {
    const t = dbTareas.find(x => x.id === id);
    if (t) {
        t.estado = t.estado === 'Concluida' ? 'Pendiente' : 'Concluida';
        t.avance = t.estado === 'Concluida' ? 100 : t.avance;
        await guardarEnGitHub('tareas.json', dbTareas, 'Cambiar estado');
        renderizarInterfazPorRol();
    }
}

async function eliminarTarea(id) {
    if (sesionActual.rol !== 'admin') return;
    if (confirm('¿Eliminar tarea?')) {
        dbTareas = dbTareas.filter(t => t.id !== id);
        await guardarEnGitHub('tareas.json', dbTareas, 'Eliminar tarea');
        renderizarInterfazPorRol();
    }
}
