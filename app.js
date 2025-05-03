window.onload = function () {
  const storedSongs = JSON.parse(localStorage.getItem('songs'));
  if (storedSongs) {
    storedSongs.forEach(song => {
      addSongToList(song);
    });
  }
};

function addSongToList(song) {
  const songItem = document.createElement('div');
  songItem.className = 'song';

  songItem.innerHTML = `
    <h3>${song.name} — ${song.artist}</h3>
    <p>${song.story}</p>
    <a href="${song.link}" target="_blank">Listen 🎧</a>
  `;

  document.getElementById('song-list').prepend(songItem);
}

function submitSong() {
  const songName = document.getElementById('song-name').value.trim();
  const songArtist = document.getElementById('song-artist').value.trim();
  const songLink = document.getElementById('song-link').value.trim();
  const songStory = document.getElementById('song-story').value.trim();

  if (songName && songArtist && songLink && songStory) {
    const song = { name: songName, artist: songArtist, link: songLink, story: songStory };

    let storedSongs = JSON.parse(localStorage.getItem('songs')) || [];
    storedSongs.push(song);
    localStorage.setItem('songs', JSON.stringify(storedSongs));

    // Hide form and list
    document.querySelector('.song-form').style.display = 'none';
    document.getElementById('song-list').style.display = 'none';

    // Show thank you message
    const container = document.querySelector('.container');
    const thankYou = document.createElement('h2');
    thankYou.innerText = "Thank you hooman! 💙";
    thankYou.style.textAlign = "center";
    thankYou.style.marginTop = "40px";
    container.appendChild(thankYou);
  } else {
    alert("Please fill in all the fields!");
  }
}
