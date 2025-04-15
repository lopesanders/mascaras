// --- Referências DOM ---
const imageLoader = document.getElementById('imageLoader');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const loadingMessage = document.getElementById('loadingMessage'); // Para carregamento da foto do usuário
const instructionMessage = document.getElementById('instructionMessage');
const templateOptionsContainer = document.querySelector('.template-options'); // Container das opções
const templateLoadingMessage = document.getElementById('templateLoadingMessage'); // Para carregamento do template

// --- CONFIGURAÇÃO ---
// Lista dos caminhos para os arquivos de template PRINCIPAIS (não as thumbs)
const TEMPLATE_PATHS = [
    'template1.png',
    'template2.png',
    'template3.png',
    'template4.png',
    'template5.png'
    // Adicione mais caminhos se tiver mais templates
];
const outputFilename = 'minha-imagem-personalizada.png';
const ZOOM_SENSITIVITY = 0.002;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
// --- FIM DA CONFIGURAÇÃO ---

// --- Variáveis de Estado ---
let userImage = null; // Objeto Image da foto do usuário
let currentTemplateImage = null; // Objeto Image do template atualmente carregado e selecionado
let currentTemplatePath = TEMPLATE_PATHS[0]; // Caminho do template selecionado (começa com o primeiro)

// Estado da imagem do usuário (pan/zoom)
let scale = 1;
let offsetX = 0;
let offsetY = 0;

// Estado do arraste (pan) e toque
let isDragging = false;
let lastDragX;
let lastDragY;

// Estado do Pinch Zoom
let isPinching = false;
let initialPinchDistance = null;
let pinchStartScale = null;

let canvasWidth = 0; // Largura do canvas (será definida pelo primeiro template)
let canvasHeight = 0; // Altura do canvas

let combinedImageBlob = null; // Blob para compartilhamento

// --- Funções Auxiliares ---

function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touch1, touch2, canvasRect) {
    return {
        x: ((touch1.clientX + touch2.clientX) / 2) - canvasRect.left,
        y: ((touch1.clientY + touch2.clientY) / 2) - canvasRect.top
    };
}

function getEventCanvasLocation(e, canvasRect) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.clientX && e.clientY) {
        clientX = e.clientX;
        clientY = e.clientY;
    } else { return null; }
    return { x: clientX - canvasRect.left, y: clientY - canvasRect.top };
}

// --- Funções Principais ---

// Carrega uma imagem específica (template ou usuário)
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => {
            console.error(`Erro ao carregar imagem: ${src}`, err);
            reject(err);
        };
        img.src = src;
    });
}

// Define o tamanho do canvas e carrega o template inicial
async function initializeCanvasAndTemplate() {
    try {
        templateLoadingMessage.style.display = 'block';
        const firstTemplate = await loadImage(TEMPLATE_PATHS[0]); // Carrega o primeiro template
        currentTemplateImage = firstTemplate; // Define como template atual
        currentTemplatePath = TEMPLATE_PATHS[0]; // Define o caminho atual

        // Define o tamanho do canvas baseado no PRIMEIRO template
        // Assumindo que todos os templates têm o mesmo tamanho!
        canvasWidth = firstTemplate.naturalWidth;
        canvasHeight = firstTemplate.naturalHeight;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        console.log(`Canvas inicializado com ${canvasWidth}x${canvasHeight}`);
        templateLoadingMessage.style.display = 'none';
        // Pode desenhar o template inicial no canvas se quiser uma prévia
        // redrawCanvas(); // Descomente se quiser mostrar o template antes da foto
    } catch (error) {
        templateLoadingMessage.style.display = 'none';
        alert(`Erro crítico ao carregar o template inicial (${TEMPLATE_PATHS[0]}). Verifique o arquivo e recarregue a página.`);
    }
}

// Redesenha o canvas com a imagem do usuário e o template ATUAL
function redrawCanvas() {
    if (!currentTemplateImage || canvasWidth === 0) {
        // console.warn("Tentativa de redesenhar sem template carregado ou canvas não inicializado.");
        return; // Não desenha se o template atual não estiver carregado ou canvas não pronto
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Desenha a imagem do usuário (se existir)
    if (userImage) {
        ctx.save();
        ctx.drawImage(
            userImage,
            offsetX,
            offsetY,
            userImage.naturalWidth * scale,
            userImage.naturalHeight * scale
        );
        ctx.restore();
    } else {
         // Opcional: Desenhar um fundo ou placeholder se não houver imagem do usuário
         ctx.fillStyle = '#f0f0f0'; // Um cinza claro
         ctx.fillRect(0, 0, canvas.width, canvas.height);
         ctx.fillStyle = '#aaa';
         ctx.font = '16px sans-serif';
         ctx.textAlign = 'center';
        // ctx.fillText('Envie sua foto', canvas.width / 2, canvas.height / 2); // Removido para não poluir
    }

    // 2. Desenha o template ATUAL por cima
    ctx.drawImage(currentTemplateImage, 0, 0, canvas.width, canvas.height);

    // Prepara para compartilhamento (se houver imagem do usuário)
    if (userImage) {
        prepareShare();
    } else {
        shareBtn.style.display = 'none'; // Garante que o botão share esteja escondido
        combinedImageBlob = null;
    }
}

// Define a posição/zoom inicial da imagem do usuário para caber no canvas
function setInitialImageTransform() {
    if (!userImage || canvasWidth === 0) return;

    const imgWidth = userImage.naturalWidth;
    const imgHeight = userImage.naturalHeight;

    // Calcula a escala para a imagem preencher o canvas (aspect fill)
    scale = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight);
    // Garante que a escala inicial não seja menor que o mínimo ou maior que o máximo
    scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));

    // Centraliza a imagem
    offsetX = (canvasWidth - imgWidth * scale) / 2;
    offsetY = (canvasHeight - imgHeight * scale) / 2;

    // Não redesenha aqui, será chamado depois
}

// --- Event Handlers ---

// Listener para carregamento da imagem do usuário
imageLoader.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Por favor, selecione um arquivo de imagem válido.');
        imageLoader.value = ''; return;
    }
    if (!currentTemplateImage) {
         alert('Erro: Template inicial não carregado. Recarregue a página.');
         return;
    }

    loadingMessage.style.display = 'block';
    instructionMessage.style.display = 'none';
    downloadBtn.disabled = true;
    shareBtn.style.display = 'none';
    canvas.style.cursor = 'default';
    isDragging = false; isPinching = false; // Reseta estados de interação

    try {
        const reader = new FileReader();
        const userImagePromise = new Promise((resolve, reject) => {
             reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
             };
             reader.onerror = reject;
             reader.readAsDataURL(file);
        });

        userImage = await userImagePromise; // Espera a imagem do usuário carregar

        setInitialImageTransform(); // Calcula a posição/zoom inicial
        redrawCanvas(); // Desenha tudo (usuário + template atual)

        // Habilita controles
        downloadBtn.disabled = false;
        loadingMessage.style.display = 'none';
        instructionMessage.style.display = 'block';
        canvas.style.cursor = 'grab';

    } catch (error) {
        console.error("Erro ao carregar imagem do usuário:", error);
        alert("Ocorreu um erro ao carregar sua imagem. Tente outro arquivo.");
        loadingMessage.style.display = 'none';
        instructionMessage.style.display = 'none';
        downloadBtn.disabled = true;
        shareBtn.style.display = 'none';
        imageLoader.value = '';
        userImage = null; // Reseta
        redrawCanvas(); // Redesenha para limpar a imagem antiga (mostra só o template)
    }
});

// Listener para seleção de template
templateOptionsContainer.addEventListener('change', async (event) => {
    if (event.target.type === 'radio' && event.target.name === 'template_choice') {
        const selectedPath = event.target.value;
        if (selectedPath === currentTemplatePath) return; // Não faz nada se for o mesmo

        currentTemplatePath = selectedPath; // Atualiza o caminho selecionado
        templateLoadingMessage.style.display = 'block'; // Mostra carregando
        instructionMessage.style.display = 'none'; // Esconde instruções durante carregamento
        canvas.style.cursor = 'wait'; // Cursor de espera

        try {
            currentTemplateImage = await loadImage(currentTemplatePath); // Carrega o novo template
            // Verifica se as dimensões são as mesmas (opcional, mas bom)
            if (currentTemplateImage.naturalWidth !== canvasWidth || currentTemplateImage.naturalHeight !== canvasHeight) {
                 console.warn("Atenção: O template selecionado tem dimensões diferentes do inicial. A interface pode não se comportar como esperado.");
                 // Poderia tentar redimensionar o canvas aqui, mas aumenta a complexidade.
                 // Por ora, vamos manter o tamanho original do canvas.
                 // canvas.width = currentTemplateImage.naturalWidth;
                 // canvas.height = currentTemplateImage.naturalHeight;
                 // canvasWidth = canvas.width;
                 // canvasHeight = canvas.height;
                 // // Recalcular posição da imagem do usuário se ela existir?
                 // if(userImage) setInitialImageTransform();
            }

            redrawCanvas(); // Redesenha o canvas com o novo template
        } catch (error) {
            alert(`Erro ao carregar o template ${currentTemplatePath}. Tentando voltar ao anterior.`);
            // Tenta voltar ao estado anterior (melhor UX)
            const previousRadio = templateOptionsContainer.querySelector(`input[value="${TEMPLATE_PATHS[0]}"]`) || templateOptionsContainer.querySelector('input[type="radio"]'); // Tenta o primeiro ou qualquer um
            if(previousRadio) previousRadio.checked = true;
            // Tenta recarregar o primeiro template como fallback
             try {
                 currentTemplateImage = await loadImage(TEMPLATE_PATHS[0]);
                 currentTemplatePath = TEMPLATE_PATHS[0];
                 redrawCanvas();
             } catch(fallbackError) {
                 alert("Erro crítico ao carregar templates. Recarregue a página.");
             }

        } finally {
            templateLoadingMessage.style.display = 'none'; // Esconde carregando
             if(userImage) instructionMessage.style.display = 'block'; // Mostra instruções de volta se user carregou foto
             canvas.style.cursor = userImage ? 'grab' : 'default'; // Restaura cursor apropriado
        }
    }
});


// --- Event Handlers para Mouse e Touch (Pan/Zoom) ---
// (Estas funções permanecem IGUAIS à versão anterior, pois operam
// sobre as variáveis de estado offsetX, offsetY, scale e chamam redrawCanvas)

canvas.addEventListener('mousedown', (e) => {
    if (!userImage || isPinching) return;
    isDragging = true;
    const location = getEventCanvasLocation(e, canvas.getBoundingClientRect());
    if (!location) return;
    lastDragX = location.x - offsetX;
    lastDragY = location.y - offsetY;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || !userImage || isPinching) return;
    const location = getEventCanvasLocation(e, canvas.getBoundingClientRect());
     if (!location) return;
    offsetX = location.x - lastDragX;
    offsetY = location.y - lastDragY;
    redrawCanvas();
    e.preventDefault();
});

canvas.addEventListener('mouseup', () => {
    if (!userImage || !isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
    }
});

canvas.addEventListener('wheel', (e) => {
    if (!userImage || isPinching) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const imgX = (mouseX - offsetX) / scale;
    const imgY = (mouseY - offsetY) / scale;
    let delta = e.deltaY * ZOOM_SENSITIVITY;
    let newScale = scale - delta;
    newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    offsetX = mouseX - imgX * newScale;
    offsetY = mouseY - imgY * newScale;
    scale = newScale;
    redrawCanvas();
});

canvas.addEventListener('touchstart', (e) => {
    if (!userImage) return;
    e.preventDefault();
    const touches = e.touches;
    const rect = canvas.getBoundingClientRect();
    if (touches.length === 1) {
        isDragging = true;
        isPinching = false;
        const location = getEventCanvasLocation(e, rect);
        if (!location) return;
        lastDragX = location.x - offsetX;
        lastDragY = location.y - offsetY;
    } else if (touches.length === 2) {
        isDragging = false;
        isPinching = true;
        initialPinchDistance = getDistance(touches[0], touches[1]);
        pinchStartScale = scale;
    }
});

canvas.addEventListener('touchmove', (e) => {
    if (!userImage) return;
    e.preventDefault();
    const touches = e.touches;
    const rect = canvas.getBoundingClientRect();
    if (isDragging && touches.length === 1) {
        const location = getEventCanvasLocation(e, rect);
         if (!location) return;
        offsetX = location.x - lastDragX;
        offsetY = location.y - lastDragY;
        redrawCanvas();
    } else if (isPinching && touches.length === 2) {
        const currentDistance = getDistance(touches[0], touches[1]);
        if (initialPinchDistance == null || pinchStartScale == null) return;
        const scaleFactor = currentDistance / initialPinchDistance;
        let newScale = pinchStartScale * scaleFactor;
        newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
        const midpoint = getMidpoint(touches[0], touches[1], rect);
        const scaleDelta = newScale / scale;
        offsetX = midpoint.x - (midpoint.x - offsetX) * scaleDelta;
        offsetY = midpoint.y - (midpoint.y - offsetY) * scaleDelta;
        scale = newScale;
        redrawCanvas();
    }
});

canvas.addEventListener('touchend', (e) => {
    if (!userImage) return;
    const touches = e.touches;
    if (touches.length === 0) {
        isDragging = false;
        isPinching = false;
        initialPinchDistance = null;
        pinchStartScale = null;
        canvas.style.cursor = 'grab';
    } else if (touches.length === 1 && isPinching) {
        isPinching = false;
        isDragging = true;
        initialPinchDistance = null;
        pinchStartScale = null;
        const rect = canvas.getBoundingClientRect();
        const location = getEventCanvasLocation(e, rect);
         if (!location) return;
        lastDragX = location.x - offsetX;
        lastDragY = location.y - offsetY;
    }
});

// --- Botões de Ação (Download / Share) ---
// (Estas funções permanecem IGUAIS à versão anterior)

downloadBtn.addEventListener('click', () => {
    if (!userImage || !currentTemplateImage) return;
    const link = document.createElement('a');
    // O canvas já contém o resultado de redrawCanvas (usuário + template atual)
    link.href = canvas.toDataURL('image/png');
    link.download = outputFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

function prepareShare() {
    if (!navigator.share || !canvas || canvas.width === 0 || canvas.height === 0 || !userImage) {
         shareBtn.style.display = 'none';
         combinedImageBlob = null; return;
    }
    canvas.toBlob( (blob) => {
        if (blob) {
            combinedImageBlob = blob;
            if(downloadBtn.disabled === false) { shareBtn.style.display = 'inline-block'; }
        } else {
            console.error("Falha ao criar Blob da imagem para compartilhamento.");
            shareBtn.style.display = 'none'; combinedImageBlob = null;
        }
    }, 'image/png');
}

shareBtn.addEventListener('click', async () => {
    if (!combinedImageBlob) {
        alert("A imagem ainda não está pronta para compartilhar ou ocorreu um erro."); return;
    }
    const shareData = {
        files: [ new File([combinedImageBlob], outputFilename, { type: combinedImageBlob.type }) ],
        title: 'Minha Imagem Personalizada',
        text: 'Veja a imagem que criei!',
    };
    try {
        await navigator.share(shareData);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Erro ao compartilhar:', err);
            alert(`Erro ao compartilhar: ${err.message}`);
        }
    }
});


// --- Inicialização ---
// Usamos DOMContentLoaded para garantir que o HTML foi parseado antes de rodar o JS
document.addEventListener('DOMContentLoaded', () => {
    imageLoader.value = ''; // Limpa seleção de arquivo anterior
    loadingMessage.style.display = 'none';
    instructionMessage.style.display = 'none';
    downloadBtn.disabled = true;
    shareBtn.style.display = 'none';

    // Inicializa o canvas com o primeiro template
    initializeCanvasAndTemplate();
});
