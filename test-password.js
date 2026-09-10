const bcrypt = require('bcryptjs');
const hash = '$2a$10$8qO9A8dLAbNn8wx0pFKaieM95wDbhhv23JpIt8uyKn0Qs8zprEljC';
const passwords = ['testpassword', 'password', 'admin', '123456', 'Jefram123', 'jefram123', 'Jefram@123', 'jefram@123', 'Jeframstore', 'jeframstore', 'admin123', '009911'];

async function test() {
  for (const p of passwords) {
    const valid = await bcrypt.compare(p, hash);
    console.log(p, valid);
  }
}
test();