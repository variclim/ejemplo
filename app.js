// ================= CONFIGURACIÓN DE TU REPOSITORIO GITHUB =================
const GITHUB_USER = "tu-usuario-de-github";
const GITHUB_REPO = "nombre-de-tu-repositorio";
const GITHUB_BRANCH = "main";

let tokenAdmin = sessionStorage.getItem('ep_github_token') || "";

let examenes = [];
let bancoPreguntas = [];
let examenesRegistrados = [];

let examenSeleccionadoActivo = null;
let preguntasExamenActual = [];
let tiempoRestanteSegundos = 0;
let intervaloTimer = null;
let alumnoActivo = {};

// Inicializar cargando datos desde GitHub al abrir la página
window.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosDesdeGitHub();
    cambiarVista('alumno');
});

function mostrarToast(mensaje, tipo = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = `fixed top-5 right-5 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-medium text-sm transition-all duration-300 ${tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ================= CONEXIÓN CON LA "BASE DE DATOS" EN GITHUB =================
async function leerArchivoGitHub(ruta) {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${ruta}`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const contenidoDecodificado = decodeURIComponent(escape(atob(data.content)));
            return JSON.parse(contenidoDecodificado);
        }
    } catch (e) {
        console.log(`No se pudo leer ${ruta} de GitHub.`);
    }
    return null;
}

async function cargarDatosDesdeGitHub() {
    examenes = await leerArchivoGitHub('examenes.json') || [
        { id: 1, titulo: 'Fundamentos de IoT y Redes', descripcion: 'Evaluación inicial.', tiempoMinutos: 5 }
    ];
    bancoPreguntas = await leerArchivoGitHub('preguntas.json') || [
        { id: 1, examenId: 1, tipo: 'opcion_multiple', pregunta: '¿Qué protocolo se usa en IoT ligero?', opciones: ['HTTP', 'MQTT', 'FTP'], respuestaCorrecta: 'MQTT' }
    ];
    examenesRegistrados = await leerArchivoGitHub('calificaciones.json') || [];
}

async function guardarEnGitHub(rutaArchivo, contenidoObjeto, mensajeCommit) {
    if (!tokenAdmin) {
        mostrarToast('Acción bloqueada: Inicia sesión como Admin con tu Token de GitHub.', 'error');
        return false;
    }

    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/data/${rutaArchivo}`;
    let sha = "";

    try {
        const resGet = await fetch(url, {
            headers: { "Authorization": `token ${tokenAdmin}` }
        });
        if (resGet.ok) {
            const data = await resGet.json();
            sha = data.sha;
        }
    } catch (e) { console.log("Archivo nuevo o sin SHA previo"); }

    const contenidoBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(contenidoObjeto, null, 2))));

    const resPut = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${tokenAdmin}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: mensajeCommit,
            content: contenidoBase64,
            sha: sha,
            branch: GITHUB_BRANCH
        })
    });

    if (resPut.ok) {
        mostrarToast('¡Base de datos en GitHub actualizada!');
        return true;
    } else {
        mostrarToast('Error al actualizar en GitHub. Revisa tu Token.', 'error');
        return false;
    }
}

// ================= LOGIN DE ADMINISTRADOR =================
function verificarAdmin() {
    const modalHtml = `
        <div id="modalLogin" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-6">
                <div class="text-center">
                    <h3 class="text-xl font-extrabold text-slate-900">Acceso Administrador</h3>
                    <p class="text-xs text-slate-500 mt-1">Ingresa contraseña y tu Token de GitHub para actualizar la BD.</p>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Contraseña Admin</label>
                        <input type="password" id="inputPwdAdmin" placeholder="••••••••" class="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">GitHub Personal Access Token (PAT)</label>
                        <input type="password" id="inputTokenAdmin" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" class="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                    </div>
                </div>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('modalLogin').remove()" class="w-1/2 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm">Cancelar</button>
                    <button onclick="procesarLoginAdmin()" class="w-1/2 py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm shadow">Ingresar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function procesarLoginAdmin() {
    const pwd = document.getElementById('inputPwdAdmin').value;
    const token = document.getElementById('inputTokenAdmin').value.trim();

    if (pwd === 'admin123' && token.startsWith('ghp_')) {
        tokenAdmin = token;
        sessionStorage.setItem('ep_github_token', token);
        document.getElementById('modalLogin').remove();
        mostrarToast('¡Inicio de sesión exitoso!');
        cambiarVista('admin');
    } else {
        alert('Contraseña incorrecta o Token de GitHub inválido (debe iniciar con ghp_).');
    }
}

// ================= NAVEGACIÓN Y VISTAS =================
function cambiarVista(vista) {
    if (vista === 'alumno') {
        document.getElementById('vistaAlumno').classList.remove('hidden');
        document.getElementById('vistaAdmin').classList.add('hidden');
        document.getElementById('btnVistaAlumno').className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white shadow-sm transition';
        document.getElementById('btnVistaAdmin').className = 'px-4 py-2 text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-200 transition';
        cargarExamenesDisponiblesAlumno();
    } else {
        if (!tokenAdmin) {
            verificarAdmin();
            return;
        }
        document.getElementById('vistaAlumno').classList.add('hidden');
        document.getElementById('vistaAdmin').classList.remove('hidden');
        document.getElementById('btnVistaAdmin').className = 'px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white transition';
        document.getElementById('btnVistaAlumno').className = 'px-4 py-2 text-sm font-semibold rounded-xl text-slate-700 hover:bg-slate-200 transition';
        actualizarDashboardAdmin();
    }
}

// ================= PORTAL ALUMNO =================
function cargarExamenesDisponiblesAlumno() {
    const contenedor = document.getElementById('listaExamenesDisponibles');
    contenedor.innerHTML = examenes.length === 0 ? `<p class="text-sm text-slate-400 text-center">No hay exámenes disponibles.</p>` : '';

    examenes.forEach(ex => {
        const totalPregs = bancoPreguntas.filter(p => p.examenId === ex.id).length;
        contenedor.innerHTML += `
            <div class="p-6 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-slate-200 flex justify-between items-center transition cursor-pointer" onclick="seleccionarExamen(${ex.id})">
                <div>
                    <h3 class="font-bold text-slate-900 text-lg">${ex.titulo}</h3>
                    <p class="text-xs text-slate-500 mt-0.5">${ex.descripcion}</p>
                    <div class="flex gap-3 text-xs text-slate-400 mt-2">
                        <span>⏱️ ${ex.tiempoMinutos} mins</span>
                        <span>❓ ${totalPregs} preguntas</span>
                    </div>
                </div>
                <span class="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow">Presentar →</span>
            </div>
        `;
    });

    document.getElementById('seccionSeleccionExamen').classList.remove('hidden');
    document.getElementById('seccionInscripcion').classList.add('hidden');
    document.getElementById('seccionExamenEnCurso').classList.add('hidden');
    document.getElementById('seccionResultadoAlumno').classList.add('hidden');
}

function seleccionarExamen(idExamen) {
    examenSeleccionadoActivo = examenes.find(e => e.id === idExamen);
    const preguntasAsociadas = bancoPreguntas.filter(p => p.examenId === idExamen);

    if (preguntasAsociadas.length === 0) {
        mostrarToast('Este examen aún no tiene preguntas configuradas.', 'error');
        return;
    }

    document.getElementById('tituloExamenSeleccionadoTag').textContent = `Evaluación #${examenSeleccionadoActivo.id}`;
    document.getElementById('tituloExamenSeleccionado').textContent = examenSeleccionadoActivo.titulo;
    document.getElementById('descripcionExamenSeleccionado').textContent = examenSeleccionadoActivo.descripcion;

    document.getElementById('seccionSeleccionExamen').classList.add('hidden');
    document.getElementById('seccionInscripcion').classList.remove('hidden');
}

function regresarASeleccionExamen() { cargarExamenesDisponiblesAlumno(); }

function iniciarExamen() {
    const nombre = document.getElementById('nombreAlumno').value.trim();
    const correo = document.getElementById('correoAlumno').value.trim();

    if (!nombre || !correo) {
        mostrarToast('Completa tu nombre y correo.', 'error');
        return;
    }

    const yaRespondio = examenesRegistrados.some(r => r.examenId === examenSeleccionadoActivo.id && r.correo === correo);
    if (yaRespondio) {
        mostrarToast('Ya has registrado un intento con este correo.', 'error');
        return;
    }

    alumnoActivo = { nombre, correo };

    document.getElementById('seccionInscripcion').classList.add('hidden');
    document.getElementById('seccionExamenEnCurso').classList.remove('hidden');

    document.getElementById('tituloExamenActivo').textContent = examenSeleccionadoActivo.titulo;
    document.getElementById('infoAlumnoActivo').textContent = `Alumno: ${nombre} (${correo})`;

    preguntasExamenActual = [...bancoPreguntas.filter(p => p.examenId === examenSeleccionadoActivo.id)].sort(() => Math.random() - 0.5);

    renderizarPreguntasEnCurso();
    tiempoRestanteSegundos = examenSeleccionadoActivo.tiempoMinutos * 60;
    iniciarCronometro();
}

function renderizarPreguntasEnCurso() {
    const contenedor = document.getElementById('formExamen');
    contenedor.innerHTML = '';

    preguntasExamenActual.forEach((p, idx) => {
        let htmlOpciones = '';
        if (p.tipo === 'opcion_multiple' || p.tipo === 'falso_verdadero') {
            let opcionesMezcladas = [...p.opciones].sort(() => Math.random() - 0.5);
            opcionesMezcladas.forEach(op => {
                htmlOpciones += `
                    <label class="block p-3.5 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200 cursor-pointer transition text-sm">
                        <input type="radio" name="p_${p.id}" value="${op}" class="mr-3 text-blue-600 focus:ring-blue-500">
                        ${op}
                    </label>
                `;
            });
        } else {
            htmlOpciones = `<textarea name="p_${p.id}" rows="3" placeholder="Escribe tu respuesta..." class="w-full p-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50"></textarea>`;
        }

        contenedor.innerHTML += `
            <div class="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                <span class="text-xs font-bold text-blue-600 uppercase">Pregunta ${idx + 1}</span>
                <p class="font-semibold text-slate-900 text-base">${p.pregunta}</p>
                <div class="space-y-2">${htmlOpciones}</div>
            </div>
        `;
    });
}

function iniciarCronometro() {
    intervaloTimer = setInterval(() => {
        tiempoRestanteSegundos--;
        let mins = Math.floor(tiempoRestanteSegundos / 60);
        let secs = tiempoRestanteSegundos % 60;
        document.getElementById('timer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (tiempoRestanteSegundos <= 0) {
            clearInterval(intervaloTimer);
            mostrarToast('Tiempo expirado.', 'error');
            finalizarExamen();
        }
    }, 1000);
}

async function finalizarExamen() {
    clearInterval(intervaloTimer);

    let aciertos = 0;
    let totalCalificables = 0;
    let detalleRespuestas = [];

    preguntasExamenActual.forEach(p => {
        if (p.tipo !== 'abierta') {
            totalCalificables++;
            const seleccion = document.querySelector(`input[name="p_${p.id}"]:checked`);
            const valor = seleccion ? seleccion.value : 'Sin respuesta';
            if (valor === p.respuestaCorrecta) aciertos++;
            detalleRespuestas.push({ pregunta: p.pregunta, respuesta: valor, correcta: p.respuestaCorrecta });
        } else {
            const textoAbierto = document.querySelector(`textarea[name="p_${p.id}"]`).value || 'Sin respuesta';
            detalleRespuestas.push({ pregunta: p.pregunta, respuesta: textoAbierto, correcta: 'Pregunta Abierta' });
        }
    });

    const calificacionFinal = totalCalificables > 0 ? ((aciertos / totalCalificables) * 10).toFixed(1) : 10;

    const registroIntento = {
        id: Date.now(),
        examenId: examenSeleccionadoActivo.id,
        tituloExamen: examenSeleccionadoActivo.titulo,
        fecha: new Date().toLocaleString(),
        alumno: alumnoActivo.nombre,
        correo: alumnoActivo.correo,
        aciertos,
        totalCalificables,
        calificacionFinal,
        detalle: detalleRespuestas
    };

    examenesRegistrados.push(registroIntento);
    
    // Guardar automáticamente en GitHub (requiere token temporal o sesión activa del admin registrada en sessionStorage si el alumno presenta)
    // Nota: Como los alumnos no tienen token, podemos respaldar en localStorage temporal o configurar un token público de escritura si se prefiere. 
    // Para simplificar aquí actualizamos localmente y el admin puede sincronizar.
    localStorage.setItem('ep_examenesRegistrados', JSON.stringify(examenesRegistrados));

    document.getElementById('seccionExamenEnCurso').classList.add('hidden');
    document.getElementById('seccionResultadoAlumno').classList.remove('hidden');

    document.getElementById('mensajeCalificacion').innerHTML = `
        Alumno: <strong>${alumnoActivo.nombre}</strong><br>
        Evaluación: <strong>${examenSeleccionadoActivo.titulo}</strong><br>
        Calificación Final: <span class="text-blue-600 font-extrabold text-3xl">${calificacionFinal} / 10</span>
    `;
}

// ================= PANEL ADMIN Y PERSISTENCIA EN GITHUB =================
function cambiarTabAdmin(tab) {
    document.getElementById('tabExamenes').classList.add('hidden');
    document.getElementById('tabBanco').classList.add('hidden');
    document.getElementById('tabCalificaciones').classList.add('hidden');

    document.getElementById('tabBtnExamenes').className = 'font-semibold text-sm px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition';
    document.getElementById('tabBtnBanco').className = 'font-semibold text-sm px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition';
    document.getElementById('tabBtnCalificaciones').className = 'font-semibold text-sm px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition';

    if (tab === 'examenes') {
        document.getElementById('tabExamenes').classList.remove('hidden');
        document.getElementById('tabBtnExamenes').className = 'font-bold text-sm px-4 py-2 rounded-xl bg-blue-600 text-white transition';
        renderizarExamenesAdmin();
    } else if (tab === 'banco') {
        document.getElementById('tabBanco').classList.remove('hidden');
        document.getElementById('tabBtnBanco').className = 'font-bold text-sm px-4 py-2 rounded-xl bg-blue-600 text-white transition';
        llenarSelectExamenesAdmin();
        renderizarBancoAdmin();
    } else {
        document.getElementById('tabCalificaciones').classList.remove('hidden');
        document.getElementById('tabBtnCalificaciones').className = 'font-bold text-sm px-4 py-2 rounded-xl bg-blue-600 text-white transition';
        renderizarCalificacionesAdmin();
    }
    actualizarDashboardAdmin();
}

function actualizarDashboardAdmin() {
    document.getElementById('statTotalExamenes').textContent = examenes.length;
    document.getElementById('statTotalAlumnos').textContent = [...new Set(examenesRegistrados.map(r => r.correo))].length;
    if (examenesRegistrados.length > 0) {
        const suma = examenesRegistrados.reduce((acc, curr) => acc + parseFloat(curr.calificacionFinal), 0);
        document.getElementById('statPromedioGeneral').textContent = (suma / examenesRegistrados.length).toFixed(1);
    } else {
        document.getElementById('statPromedioGeneral').textContent = '0.0';
    }
}

async function crearExamen() {
    const titulo = document.getElementById('nuevoTituloExamen').value.trim();
    const tiempoMinutos = parseInt(document.getElementById('nuevoTiempoExamen').value) || 10;
    const descripcion = document.getElementById('nuevoDescExamen').value.trim();

    if (!titulo) { mostrarToast('Ingresa un título.', 'error'); return; }

    examenes.push({ id: Date.now(), titulo, descripcion, tiempoMinutos });
    
    // Guardar directamente en GitHub
    const exito = await guardarEnGitHub('examenes.json', examenes, 'Crear nuevo examen desde panel admin');
    if (exito) {
        document.getElementById('nuevoTituloExamen').value = '';
        document.getElementById('nuevoDescExamen').value = '';
        renderizarExamenesAdmin();
    }
}

function renderizarExamenesAdmin() {
    const contenedor = document.getElementById('listaExamenesAdmin');
    contenedor.innerHTML = examenes.length === 0 ? `<p class="text-sm text-slate-400">No hay exámenes.</p>` : '';
    examenes.forEach(ex => {
        contenedor.innerHTML += `
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
                <div><span class="font-bold">${ex.titulo}</span> (${ex.tiempoMinutos} mins)</div>
                <button onclick="eliminarExamen(${ex.id})" class="bg-rose-50 text-rose-600 text-xs font-semibold px-3 py-1.5 rounded-lg">Eliminar</button>
            </div>
        `;
    });
}

async function eliminarExamen(id) {
    if (confirm('¿Eliminar examen?')) {
        examenes = examenes.filter(e => e.id !== id);
        bancoPreguntas = bancoPreguntas.filter(p => p.examenId !== id);
        await guardarEnGitHub('examenes.json', examenes, 'Eliminar examen');
        await guardarEnGitHub('preguntas.json', bancoPreguntas, 'Actualizar preguntas tras eliminar examen');
        renderizarExamenesAdmin();
    }
}

function llenarSelectExamenesAdmin() {
    const select = document.getElementById('adminSelectExamen');
    select.innerHTML = '';
    examenes.forEach(ex => { select.innerHTML += `<option value="${ex.id}">${ex.titulo}</option>`; });
}

function cambiarTipoPreguntaAdmin() {
    const tipo = document.getElementById('adminTipo').value;
    const opcCont = document.getElementById('contenedorOpciones');
    const corrInput = document.getElementById('adminCorrecta');
    if (tipo === 'falso_verdadero') { opcCont.classList.add('hidden'); corrInput.value = 'Verdadero'; }
    else if (tipo === 'abierta') { opcCont.classList.add('hidden'); corrInput.value = 'Abierta'; }
    else { opcCont.classList.remove('hidden'); corrInput.value = ''; }
}

async function guardarPreguntaBanco() {
    const examenId = parseInt(document.getElementById('adminSelectExamen').value);
    const tipo = document.getElementById('adminTipo').value;
    const pregunta = document.getElementById('adminPregunta').value.trim();
    let correcta = document.getElementById('adminCorrecta').value.trim();
    const opcInput = document.getElementById('adminOpciones').value.trim();

    if (!pregunta) { mostrarToast('Escribe la pregunta.', 'error'); return; }

    let opciones = tipo === 'opcion_multiple' ? opcInput.split(',').map(o => o.trim()) : (tipo === 'falso_verdadero' ? ['Verdadero', 'Falso'] : []);
    
    bancoPreguntas.push({ id: Date.now(), examenId, tipo, pregunta, opciones, respuestaCorrecta: correcta });
    
    const exito = await guardarEnGitHub('preguntas.json', bancoPreguntas, 'Agregar nueva pregunta al banco');
    if (exito) {
        document.getElementById('adminPregunta').value = '';
        document.getElementById('adminOpciones').value = '';
        document.getElementById('adminCorrecta').value = '';
        renderizarBancoAdmin();
    }
}

function renderizarBancoAdmin() {
    const contenedor = document.getElementById('listaPreguntasBancoAdmin');
    contenedor.innerHTML = bancoPreguntas.length === 0 ? `<p class="text-sm text-slate-400">No hay preguntas.</p>` : '';
    bancoPreguntas.forEach((p, idx) => {
        contenedor.innerHTML += `
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
                <div><span class="font-bold">#${idx + 1}:</span> ${p.pregunta}</div>
                <button onclick="eliminarPreguntaBanco(${p.id})" class="bg-rose-50 text-rose-600 text-xs font-semibold px-3 py-1 rounded-lg">Eliminar</button>
            </div>
        `;
    });
}

async function eliminarPreguntaBanco(id) {
    bancoPreguntas = bancoPreguntas.filter(p => p.id !== id);
    await guardarEnGitHub('preguntas.json', bancoPreguntas, 'Eliminar pregunta');
    renderizarBancoAdmin();
}

function renderizarCalificacionesAdmin() {
    const contenedor = document.getElementById('listaCalificacionesAdmin');
    contenedor.innerHTML = examenesRegistrados.length === 0 ? `<p class="text-sm text-slate-400">Aún no hay calificaciones.</p>` : '';
    examenesRegistrados.forEach(r => {
        contenedor.innerHTML += `
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-sm">
                <div>
                    <p class="font-bold">${r.alumno} (${r.correo})</p>
                    <p class="text-xs text-slate-500">${r.tituloExamen} — Calificación: <strong class="text-blue-600">${r.calificacionFinal}/10</strong></p>
                </div>
                <button onclick="descargarCSVIndividual(${r.id})" class="bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-xl">CSV</button>
            </div>
        `;
    });
}

function descargarReporteMaestroCSV() {
    let csv = "data:text/csv;charset=utf-8,\uFEFFReporte Maestro\nFecha,Examen,Alumno,Correo,Calificacion\n";
    examenesRegistrados.forEach(r => { csv += `"${r.fecha}","${r.tituloExamen}","${r.alumno}","${r.correo}",${r.calificacionFinal}\n`; });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `Reporte_Maestro.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}