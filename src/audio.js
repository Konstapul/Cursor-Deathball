/* MUSIC ENGINE */
const Music = (function() {
    let ctx = null;
    let isPlaying = false;
    let currentNote = 0;
    let nextNoteTime = 0;
    let lookahead = 25.0;
    let scheduleAheadTime = 0.1;
    let timerID = null;
    let gainNode = null;

    let trackPattern = null;
    let gameplayTracks = [];
    let gameOverTrack = null;

    function playKick(time) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        osc.connect(gain); gain.connect(gainNode);
        osc.start(time); osc.stop(time + 0.5);
    }

    function playSnare(time) {
        const bufferSize = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass'; noiseFilter.frequency.value = 1000;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(gainNode);
        noise.start(time);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250, time);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(gain); gain.connect(gainNode);
        osc.start(time); osc.stop(time + 0.2);
    }

    function playHiHat(time, open = false) {
         const bufferSize = ctx.sampleRate * (open ? 0.3 : 0.05);
         const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
         const data = buffer.getChannelData(0);
         for(let i=0; i<bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
         const noise = ctx.createBufferSource();
         noise.buffer = buffer;
         const filter = ctx.createBiquadFilter();
         filter.type = 'highpass'; filter.frequency.value = 7000;
         const gain = ctx.createGain();
         gain.gain.setValueAtTime(0.2, time);
         gain.gain.exponentialRampToValueAtTime(0.01, time + (open ? 0.2 : 0.05));
         noise.connect(filter); filter.connect(gain); gain.connect(gainNode);
         noise.start(time);
    }

    function playBass(time, note, length = 0.2, type = 'sawtooth') {
        if (!Number.isFinite(note)) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = type;
        const freq = 55 * Math.pow(2, note / 12);
        if (!Number.isFinite(freq)) return;
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, time);
        filter.frequency.exponentialRampToValueAtTime(100, time + length);
        gain.gain.setValueAtTime(0.4, time);
        gain.gain.linearRampToValueAtTime(0, time + length);
        osc.connect(filter); filter.connect(gain); gain.connect(gainNode);
        osc.start(time); osc.stop(time + length + 0.05);
    }

    function playGuitar(time, note) {
        if (!Number.isFinite(note)) return;
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const dist = ctx.createWaveShaper();
        function makeDistortionCurve(amount) {
            let k = typeof amount === 'number' ? amount : 50,
                n_samples = 44100,
                curve = new Float32Array(n_samples),
                deg = Math.PI / 180,
                i = 0, x;
            for ( ; i < n_samples; ++i ) {
                x = i * 2 / n_samples - 1;
                curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
            }
            return curve;
        }
        dist.curve = makeDistortionCurve(100);
        dist.oversample = '4x';
        const freq = 110 * Math.pow(2, note / 12);
        if (!Number.isFinite(freq)) return;
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        osc2.type = 'sawtooth'; osc2.frequency.value = freq * 1.01;
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
        osc.connect(dist); osc2.connect(dist);
        dist.connect(gain); gain.connect(gainNode);
        osc.start(time); osc.stop(time + 0.4);
        osc2.start(time); osc2.stop(time + 0.4);
    }

    function playDrone(time, note) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const freq = 55 * Math.pow(2, note / 12);
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + 0.5);
        gain.gain.linearRampToValueAtTime(0, time + 3.0);
        osc.connect(gain); gain.connect(gainNode);
        osc.start(time); osc.stop(time + 3.0);
    }

    gameplayTracks.push({
        name: "RIP & TEAR",
        tempo: 150,
        len: 64,
        notes: (i) => {
            if (i%4 === 0) playKick(nextNoteTime);
            if (i%8 === 4) playSnare(nextNoteTime);
            if (i%2 === 0) playHiHat(nextNoteTime);
            const bassSeq = [0,0,0,0,3,0,2,0, 0,0,0,0,3,0,5,3];
            if (i % 2 === 0) playBass(nextNoteTime, bassSeq[Math.floor(i/2)%16]);
            if (i >= 32 && i % 4 === 0) {
                 const leadSeq = [12, 12, 15, 14, 12, 10, 12, 15];
                 playGuitar(nextNoteTime, leadSeq[Math.floor(i/4)%8]);
            }
        }
    });

    gameplayTracks.push({
        name: "INDUSTRIAL SAW",
        tempo: 140,
        len: 64,
        notes: (i) => {
            if (i%4===0) playKick(nextNoteTime);
            if (i%8===4) playSnare(nextNoteTime);
            playHiHat(nextNoteTime, i%2===0);
            const b = [0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, -2, -2, 5, 5];
            if (i%2===0) playBass(nextNoteTime, b[Math.floor(i/2)%16], 0.15, 'square');
            if (i%32 === 0) playGuitar(nextNoteTime, 12);
            if (i%32 === 14) playGuitar(nextNoteTime, 15);
            if (i%32 === 28) playGuitar(nextNoteTime, 10);
        }
    });

    gameplayTracks.push({
        name: "CYBER GRIND",
        tempo: 160,
        len: 128,
        notes: (i) => {
            if (i%4===0) playKick(nextNoteTime);
            if (i%8===4) playSnare(nextNoteTime);
            if (i%2===0) playHiHat(nextNoteTime, i%4===2);
            const b = [-5, -5, -5, -2, -5, -5, 0, 0];
            if (i%2 === 0) playBass(nextNoteTime, b[Math.floor(i/2)%8], 0.1, 'sawtooth');
            if (i%32 === 0) playGuitar(nextNoteTime, -12);
            if (i%64 === 48) playGuitar(nextNoteTime, -5);
            if (i%32 >= 24) playHiHat(nextNoteTime);
        }
    });

    gameOverTrack = {
        name: "M.I.A.",
        tempo: 60,
        len: 32,
        notes: (i) => {
            if (i%16 === 0) playDrone(nextNoteTime, -12);
            if (i%16 === 8) playDrone(nextNoteTime, -17);
            if (i%4 === 0) playBass(nextNoteTime, 0, 0.5);
        }
    };

    function scheduler() {
        while (nextNoteTime < ctx.currentTime + scheduleAheadTime) {
            if(trackPattern) trackPattern.notes(currentNote);
            const secondsPerBeat = 60.0 / trackPattern.tempo;
            const secondsPer16th = secondsPerBeat * 0.25;
            nextNoteTime += secondsPer16th;
            currentNote++;
            if (currentNote >= trackPattern.len) currentNote = 0;
        }
        timerID = window.setTimeout(scheduler, lookahead);
    }

    function updateMenuInfo() {
        const el = document.getElementById('track-info');
        if(el && trackPattern) el.innerText = "TRACK: " + trackPattern.name;
    }

    return {
        init: (context, destNode) => {
            ctx = context;
            gainNode = ctx.createGain();
            gainNode.connect(destNode);
        },
        playRandomTrack: () => {
            window.clearTimeout(timerID);
            let newTrack = gameplayTracks[Math.floor(Math.random() * gameplayTracks.length)];
            if (gameplayTracks.length > 1 && newTrack === trackPattern && trackPattern !== gameOverTrack) {
                newTrack = gameplayTracks.find(t => t !== trackPattern);
            }
            trackPattern = newTrack;
            updateMenuInfo();
            isPlaying = true;
            currentNote = 0;
            nextNoteTime = ctx.currentTime + 0.1;
            scheduler();
        },
        playGameOver: () => {
            window.clearTimeout(timerID);
            trackPattern = gameOverTrack;
            updateMenuInfo();
            isPlaying = true;
            currentNote = 0;
            nextNoteTime = ctx.currentTime + 0.1;
            scheduler();
        },
        start: () => {
            if(isPlaying) return;
            if(!ctx) return;
            if(!trackPattern) trackPattern = gameplayTracks[0];
            updateMenuInfo();
            isPlaying = true;
            currentNote = 0;
            nextNoteTime = ctx.currentTime + 0.1;
            scheduler();
        },
        stop: () => {
            isPlaying = false;
            window.clearTimeout(timerID);
        },
        setVolume: (val) => {
            if(gainNode) gainNode.gain.setValueAtTime(val, ctx.currentTime);
        }
    };
})();

/* GAME AUDIO MANAGER */
const Audio = (function() {
    let ctx = null;
    let sfxGain = null;
    let masterGain = null;
    let musicGain = null;
    let muteState = 1;

    function init() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.75, ctx.currentTime);
            masterGain.connect(ctx.destination);
            sfxGain = ctx.createGain();
            sfxGain.connect(masterGain);
            musicGain = ctx.createGain();
            musicGain.connect(masterGain);
            Music.init(ctx, musicGain);
            const notify = document.getElementById('audio-notify');
            if (notify) notify.innerText = "AUDIO: MUSIC MUTED (PRESS M)";
        }
        if (ctx.state === 'suspended') ctx.resume();
    }

    function toggleMute() {
        if (!ctx) return;
        muteState = (muteState + 1) % 3;
        const notify = document.getElementById('audio-notify');
        if (muteState === 0) {
            sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);
            Music.setVolume(0.22);
            notify.innerText = "AUDIO: ALL ON";
        } else if (muteState === 1) {
            sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);
            Music.setVolume(0);
            notify.innerText = "AUDIO: MUSIC MUTED";
        } else {
            sfxGain.gain.setValueAtTime(0, ctx.currentTime);
            Music.setVolume(0);
            notify.innerText = "AUDIO: ALL MUTED";
        }
        notify.style.opacity = 1;
        setTimeout(() => { notify.style.opacity = 0; }, 1500);
    }

    function playTone(freq, type, duration, vol = 0.1, ramp = true) {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if(ramp) osc.frequency.exponentialRampToValueAtTime(freq * 0.1, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.connect(gain); gain.connect(sfxGain);
        osc.start(); osc.stop(ctx.currentTime + duration);
    }

    function playNoise(duration, vol = 0.2) {
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        noise.connect(gain); gain.connect(sfxGain);
        noise.start();
    }

    return {
        init,
        startMusic: () => {
            if(muteState !== 1 && muteState !== 2) Music.setVolume(0.22); else Music.setVolume(0);
            Music.playRandomTrack();
        },
        playGameOverMusic: () => {
            if(muteState !== 1 && muteState !== 2) Music.setVolume(0.22); else Music.setVolume(0);
            Music.playGameOver();
        },
        nextTrack: () => Music.playRandomTrack(),
        toggleMute,
        shoot: () => { if(ctx && muteState!==2) { let o=ctx.createOscillator();let g=ctx.createGain();o.type='square';o.frequency.setValueAtTime(300+Math.random()*100,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(30,ctx.currentTime+0.08);g.gain.setValueAtTime(0.03,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.08);o.connect(g);g.connect(sfxGain);o.start();o.stop(ctx.currentTime+0.08);}},
        shotgun: () => { if(ctx && muteState!==2) { playTone(150,'sawtooth',0.2,0.08); playNoise(0.2,0.08); }},
        rocket: () => { if(ctx && muteState!==2) { playTone(100,'triangle',0.5,0.1); playNoise(0.5,0.05); }},
        explode: () => { if(ctx && muteState!==2) playNoise(0.5,0.3); },
        mineExplode: () => { if(ctx && muteState!==2) { playTone(60,'square',0.5,0.4); playNoise(0.8,0.4); }},
        hit: () => { if(ctx && muteState!==2) playTone(100,'sawtooth',0.1,0.05); },
        playerDamage: () => { if(ctx && muteState!==2) { playNoise(0.15,0.6); playTone(400,'sawtooth',0.1,0.4); }},
        playerDeath: () => { if(ctx && muteState!==2) { playNoise(0.3,0.8); playTone(200,'sawtooth',0.3,0.5); }},
        crit: () => { if(ctx && muteState!==2) playTone(800,'square',0.1,0.1); },
        dash: () => { if(ctx && muteState!==2) playTone(600,'sine',0.2,0.05); },
        pickup: () => { if(ctx && muteState!==2) playTone(800,'sine',0.2,0.1,false); },
        squish: () => { if(ctx && muteState!==2) { playNoise(0.05,0.1); playTone(60,'sine',0.1,0.15); }},
        tankDeath: () => { if(ctx && muteState!==2) { playNoise(0.4,0.3); playTone(50,'square',0.5,0.2); }},
        spawnTank: () => { if(ctx && muteState!==2) playTone(40,'sawtooth',1.5,0.06,false); },
        spawnFlanker: () => { if(ctx && muteState!==2) playTone(600,'triangle',0.3,0.05,true); },
        spawnBlind: () => { if(ctx && muteState!==2) playNoise(0.5,0.05); },
        spawnBoss: () => { if(ctx && muteState!==2) { playTone(30,'sawtooth',3.0,0.3,false); playNoise(3.0,0.2); }},
        nukeSpawn: () => { if(ctx && muteState!==2) { playTone(100,'sawtooth',1.0,0.2,false); setTimeout(()=>playTone(150,'sawtooth',1.0,0.2,false),500); }},
        nukePing: (vol) => { if(ctx && muteState!==2) playTone(1000,'sine',0.1,vol); },
        nukeBlast: () => { if(ctx && muteState!==2) { playNoise(2.0,0.5); playTone(50,'square',1.0,0.5); }},
        slowMoStart: () => { if(ctx && muteState!==2) playTone(100,'sine',0.3,0.1,false); },
        slowMoEnd: () => { if(ctx && muteState!==2) playTone(200,'sine',0.2,0.1); },
        bossCharge: () => { if(ctx && muteState!==2) { playTone(80,'sawtooth',1.0,0.2,false); playNoise(0.5,0.2); }},
        bossImpact: () => { if(ctx && muteState!==2) { playNoise(0.5,0.5); playTone(40,'square',0.5,0.5); }},
        bossZap: () => { if(ctx && muteState!==2) { playTone(1500,'sawtooth',0.1,0.3); playTone(500,'square',0.1,0.3); }},
        bossClash: () => { if(ctx && muteState!==2) { playNoise(1.0,1.0); playTone(50,'square',1.0,1.0); }},
        weakPoint: () => { if(ctx && muteState!==2) { playTone(1200,'triangle',0.1,0.2); playTone(1500,'sine',0.1,0.2,false); }},
        minigunWindup: () => {
            if (!ctx || muteState === 2) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(50, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(sfxGain);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        },
        minigunSpin: () => { if(ctx && muteState!==2) playTone(80,'square',0.1,0.05); },
        mineSet: () => { if(ctx && muteState!==2) playTone(1200,'sine',0.1,0.1); },
        turretFire: () => { if(ctx && muteState!==2) playTone(800,'square',0.05,0.05); },
        tankAggro: () => { if(ctx && muteState!==2) { playTone(200,'square',0.3,0.3); playNoise(0.3,0.2); } }
    };
})();

export { Music, Audio };
