// Planteles reales de las selecciones principales (temporada 2025/26; los dorsales son orientativos).
// Orden: 11 titulares según la formación (arquero, defensas de izquierda a derecha, medios, delanteros)
// y 7 suplentes (arquero, 2 defensas, 2 medios, 2 delanteros). Los atributos se generan con el nivel de la selección.
import type { FormationId } from './types';
import type { RosterEntry } from './teams';

type P = [name: string, number: number, bonus?: number];
const squad = (formation: FormationId, players: P[]): { formation: FormationId; roster: RosterEntry[] } =>
  ({ formation, roster: players.map(([name, number, bonus]) => ({ name, number, bonus })) });

export const NATION_ROSTERS: Record<string, { formation: FormationId; roster: RosterEntry[] }> = {
  argentina: squad('4-3-3', [
    ['Emiliano Martínez', 23, 3], ['Nicolás Tagliafico', 3], ['Nicolás Otamendi', 19], ['Cristian Romero', 13, 2], ['Nahuel Molina', 26],
    ['Enzo Fernández', 24, 2], ['Alexis Mac Allister', 20, 2], ['Rodrigo De Paul', 7],
    ['Julián Álvarez', 9, 3], ['Lautaro Martínez', 22, 3], ['Lionel Messi', 10, 6],
    ['Gerónimo Rulli', 12], ['Lisandro Martínez', 25], ['Gonzalo Montiel', 4], ['Leandro Paredes', 5], ['Thiago Almada', 16], ['Nicolás González', 15], ['Giuliano Simeone', 17],
  ]),
  brasil: squad('4-2-3-1', [
    ['Alisson', 1, 3], ['Carlos Augusto', 6], ['Gabriel Magalhães', 3, 2], ['Marquinhos', 4, 2], ['Wesley', 13],
    ['Casemiro', 5], ['Bruno Guimarães', 8, 2],
    ['Vinícius Júnior', 7, 5], ['Rodrygo', 10, 2], ['Raphinha', 11, 4],
    ['Matheus Cunha', 9, 2],
    ['Ederson', 23], ['Éder Militão', 14], ['Danilo', 2], ['Lucas Paquetá', 17], ['Gerson', 15], ['Estêvão', 20], ['João Pedro', 19],
  ]),
  uruguay: squad('4-3-3', [
    ['Sergio Rochet', 1], ['Mathías Olivera', 16], ['José María Giménez', 2, 2], ['Ronald Araújo', 4, 2], ['Guillermo Varela', 13],
    ['Manuel Ugarte', 5, 2], ['Federico Valverde', 15, 5], ['Rodrigo Bentancur', 6, 2],
    ['Maximiliano Araújo', 20], ['Darwin Núñez', 9, 3], ['Facundo Pellistri', 11],
    ['Santiago Mele', 12], ['Sebastián Cáceres', 3], ['Matías Viña', 17], ['Nicolás de la Cruz', 7], ['Giorgian de Arrascaeta', 10], ['Rodrigo Aguirre', 19], ['Brian Rodríguez', 21],
  ]),
  colombia: squad('4-2-3-1', [
    ['Camilo Vargas', 12], ['Johan Mojica', 17], ['Jhon Lucumí', 3], ['Davinson Sánchez', 23], ['Daniel Muñoz', 21, 2],
    ['Jefferson Lerma', 16], ['Richard Ríos', 6, 2],
    ['Luis Díaz', 7, 5], ['James Rodríguez', 10, 3], ['Jhon Arias', 11, 2],
    ['Jhon Córdoba', 24],
    ['David Ospina', 1], ['Yerry Mina', 13], ['Carlos Cuesta', 2], ['Kevin Castaño', 5], ['Juan Fernando Quintero', 20], ['Jhon Durán', 14], ['Luis Sinisterra', 18],
  ]),
  ecuador: squad('4-3-3', [
    ['Hernán Galíndez', 1], ['Pervis Estupiñán', 7, 2], ['Willian Pacho', 6, 3], ['Piero Hincapié', 3, 3], ['Ángelo Preciado', 17],
    ['Moisés Caicedo', 23, 5], ['Alan Franco', 21], ['Pedro Vite', 15],
    ['Kendry Páez', 10, 2], ['Enner Valencia', 13, 2], ['Gonzalo Plata', 19],
    ['Moisés Ramírez', 12], ['Félix Torres', 2], ['Joel Ordóñez', 4], ['Carlos Gruezo', 8], ['Alan Minda', 16], ['Kevin Rodríguez', 11], ['Leonardo Campana', 14],
  ]),
  paraguay: squad('4-4-2', [
    ['Orlando Gill', 1], ['Junior Alonso', 6], ['Omar Alderete', 3], ['Gustavo Gómez', 15, 2], ['Juan Cáceres', 4],
    ['Julio Enciso', 19, 2], ['Andrés Cubas', 14], ['Mathías Villasanti', 23], ['Miguel Almirón', 10, 3],
    ['Antonio Sanabria', 9], ['Isidro Pitta', 18],
    ['Roberto Fernández', 12], ['Fabián Balbuena', 5], ['Blas Riveros', 13], ['Diego Gómez', 8], ['Damián Bobadilla', 16], ['Ramón Sosa', 7], ['Alex Arce', 11],
  ]),
  francia: squad('4-2-3-1', [
    ['Mike Maignan', 16, 3], ['Theo Hernández', 22], ['William Saliba', 17, 3], ['Dayot Upamecano', 4], ['Jules Koundé', 5, 2],
    ['Aurélien Tchouaméni', 8, 2], ['Adrien Rabiot', 14],
    ['Bradley Barcola', 25], ['Michael Olise', 11, 3], ['Ousmane Dembélé', 7, 5],
    ['Kylian Mbappé', 10, 6],
    ['Lucas Chevalier', 23], ['Ibrahima Konaté', 15], ['Lucas Digne', 3], ['N’Golo Kanté', 13], ['Eduardo Camavinga', 6], ['Marcus Thuram', 9], ['Randal Kolo Muani', 12],
  ]),
  espana: squad('4-3-3', [
    ['Unai Simón', 23, 2], ['Marc Cucurella', 24], ['Aymeric Laporte', 14], ['Robin Le Normand', 3], ['Dani Carvajal', 2, 2],
    ['Rodri', 16, 5], ['Pedri', 20, 5], ['Fabián Ruiz', 8, 2],
    ['Nico Williams', 17, 3], ['Álvaro Morata', 7], ['Lamine Yamal', 19, 6],
    ['David Raya', 1], ['Dean Huijsen', 4], ['Pau Cubarsí', 5], ['Martín Zubimendi', 18], ['Dani Olmo', 10], ['Mikel Oyarzabal', 21], ['Ferran Torres', 11],
  ]),
  inglaterra: squad('4-2-3-1', [
    ['Jordan Pickford', 1], ['Luke Shaw', 3], ['Marc Guéhi', 6], ['John Stones', 5], ['Reece James', 2],
    ['Declan Rice', 4, 4], ['Kobbie Mainoo', 16],
    ['Anthony Gordon', 18], ['Jude Bellingham', 10, 6], ['Bukayo Saka', 7, 4],
    ['Harry Kane', 9, 5],
    ['Dean Henderson', 13], ['Ezri Konsa', 14], ['Trent Alexander-Arnold', 12], ['Cole Palmer', 24], ['Phil Foden', 11], ['Ollie Watkins', 19], ['Marcus Rashford', 17],
  ]),
  portugal: squad('4-3-3', [
    ['Diogo Costa', 22, 2], ['Nuno Mendes', 19, 4], ['Gonçalo Inácio', 14], ['Rúben Dias', 4, 3], ['João Cancelo', 20],
    ['Vitinha', 23, 5], ['Bruno Fernandes', 8, 4], ['João Neves', 15, 3],
    ['Rafael Leão', 17, 3], ['Cristiano Ronaldo', 7, 3], ['Bernardo Silva', 10, 3],
    ['José Sá', 1], ['António Silva', 3], ['Diogo Dalot', 5], ['Rúben Neves', 18], ['João Palhinha', 6], ['Gonçalo Ramos', 9], ['João Félix', 11],
  ]),
  alemania: squad('4-2-3-1', [
    ['Marc-André ter Stegen', 1, 2], ['Maximilian Mittelstädt', 18], ['Jonathan Tah', 4], ['Antonio Rüdiger', 2, 2], ['Joshua Kimmich', 6, 4],
    ['Aleksandar Pavlović', 16], ['Leon Goretzka', 8],
    ['Florian Wirtz', 17, 5], ['Jamal Musiala', 10, 5], ['Leroy Sané', 19],
    ['Kai Havertz', 7, 2],
    ['Oliver Baumann', 12], ['Nico Schlotterbeck', 15], ['David Raum', 3], ['Robert Andrich', 23], ['Pascal Groß', 5], ['Niclas Füllkrug', 9], ['Nick Woltemade', 11],
  ]),
  paisesbajos: squad('4-3-3', [
    ['Bart Verbruggen', 1], ['Nathan Aké', 5], ['Virgil van Dijk', 4, 4], ['Micky van de Ven', 15], ['Denzel Dumfries', 22, 2],
    ['Frenkie de Jong', 21, 4], ['Tijjani Reijnders', 14, 3], ['Ryan Gravenberch', 8, 3],
    ['Cody Gakpo', 11, 3], ['Memphis Depay', 10], ['Xavi Simons', 7, 2],
    ['Mark Flekken', 13], ['Matthijs de Ligt', 3], ['Jurriën Timber', 2], ['Jerdy Schouten', 24], ['Teun Koopmeiners', 20], ['Wout Weghorst', 9], ['Donyell Malen', 18],
  ]),
  italia: squad('3-5-2', [
    ['Gianluigi Donnarumma', 1, 4], ['Alessandro Bastoni', 21, 3], ['Riccardo Calafiori', 5], ['Giovanni Di Lorenzo', 2],
    ['Federico Dimarco', 3, 2], ['Nicolò Barella', 18, 4], ['Sandro Tonali', 8, 3], ['Davide Frattesi', 16], ['Andrea Cambiaso', 20],
    ['Mateo Retegui', 9], ['Moise Kean', 11, 2],
    ['Guglielmo Vicario', 13], ['Alessandro Buongiorno', 4], ['Federico Gatti', 6], ['Manuel Locatelli', 17], ['Samuele Ricci', 14], ['Giacomo Raspadori', 10], ['Federico Chiesa', 7],
  ]),
  belgica: squad('4-3-3', [
    ['Thibaut Courtois', 1, 5], ['Maxim De Cuyper', 5], ['Arthur Theate', 3], ['Wout Faes', 4], ['Timothy Castagne', 21],
    ['Amadou Onana', 24], ['Youri Tielemans', 8, 2], ['Kevin De Bruyne', 7, 5],
    ['Jérémy Doku', 11, 3], ['Romelu Lukaku', 10, 3], ['Leandro Trossard', 9, 2],
    ['Matz Sels', 12], ['Zeno Debast', 2], ['Thomas Meunier', 15], ['Orel Mangala', 18], ['Hans Vanaken', 20], ['Loïs Openda', 14], ['Charles De Ketelaere', 17],
  ]),
  croacia: squad('4-3-3', [
    ['Dominik Livaković', 1, 2], ['Borna Sosa', 19], ['Joško Gvardiol', 4, 5], ['Josip Šutalo', 6], ['Josip Stanišić', 2],
    ['Mateo Kovačić', 8, 3], ['Luka Modrić', 10, 4], ['Mario Pašalić', 15],
    ['Ivan Perišić', 14], ['Andrej Kramarić', 9, 2], ['Lovro Majer', 7],
    ['Dominik Kotarski', 12], ['Duje Ćaleta-Car', 5], ['Marin Pongračić', 3], ['Luka Sučić', 25], ['Martin Baturina', 16], ['Ante Budimir', 11], ['Igor Matanović', 20],
  ]),
  noruega: squad('4-3-3', [
    ['Ørjan Nyland', 1], ['David Møller Wolfe', 5], ['Kristoffer Ajer', 3], ['Leo Østigård', 4], ['Julian Ryerson', 14],
    ['Sander Berge', 8], ['Martin Ødegaard', 10, 6], ['Patrick Berg', 6],
    ['Antonio Nusa', 20, 2], ['Erling Haaland', 9, 9], ['Alexander Sørloth', 7, 3],
    ['Egil Selvik', 12], ['Torbjørn Heggem', 17], ['Marcus Holmgren Pedersen', 2], ['Kristian Thorstvedt', 15], ['Oscar Bobb', 11], ['Jørgen Strand Larsen', 21], ['Andreas Schjelderup', 22],
  ]),
  suiza: squad('4-2-3-1', [
    ['Gregor Kobel', 1, 3], ['Ricardo Rodríguez', 13], ['Manuel Akanji', 5, 4], ['Nico Elvedi', 4], ['Silvan Widmer', 3],
    ['Granit Xhaka', 10, 4], ['Remo Freuler', 8],
    ['Rubén Vargas', 17], ['Fabian Rieder', 23], ['Dan Ndoye', 19, 2],
    ['Breel Embolo', 7, 2],
    ['Yvon Mvogo', 12], ['Eray Cömert', 18], ['Cédric Zesiger', 2], ['Denis Zakaria', 6], ['Michel Aebischer', 20], ['Noah Okafor', 9], ['Zeki Amdouni', 11],
  ]),
  dinamarca: squad('3-5-2', [
    ['Kasper Schmeichel', 1], ['Jannik Vestergaard', 3], ['Andreas Christensen', 6, 2], ['Joachim Andersen', 2, 2],
    ['Joakim Mæhle', 5], ['Pierre-Emile Højbjerg', 23, 3], ['Morten Hjulmand', 21, 2], ['Christian Eriksen', 10, 3], ['Alexander Bah', 18],
    ['Rasmus Højlund', 9, 3], ['Jonas Wind', 19],
    ['Mads Hermansen', 16], ['Victor Nelsson', 4], ['Rasmus Kristensen', 13], ['Christian Nørgaard', 15], ['Mikkel Damsgaard', 14], ['Yussuf Poulsen', 20], ['Kasper Dolberg', 12],
  ]),
  mexico: squad('4-3-3', [
    ['Luis Malagón', 1], ['Jesús Gallardo', 23], ['Johan Vásquez', 5, 2], ['César Montes', 3], ['Jorge Sánchez', 2],
    ['Edson Álvarez', 4, 3], ['Luis Chávez', 18], ['Luis Romo', 7],
    ['Alexis Vega', 10], ['Raúl Jiménez', 9, 3], ['Roberto Alvarado', 25],
    ['Guillermo Ochoa', 13], ['Israel Reyes', 15], ['Jesús Angulo', 21], ['Erik Lira', 6], ['Marcel Ruiz', 14], ['Santiago Giménez', 11], ['Hirving Lozano', 22],
  ]),
  usa: squad('4-3-3', [
    ['Matt Turner', 1], ['Antonee Robinson', 5, 3], ['Tim Ream', 13], ['Chris Richards', 3], ['Sergiño Dest', 2],
    ['Tyler Adams', 4, 2], ['Weston McKennie', 8, 2], ['Yunus Musah', 6],
    ['Christian Pulisic', 10, 6], ['Folarin Balogun', 20, 2], ['Timothy Weah', 21],
    ['Matt Freese', 25], ['Joe Scally', 22], ['Mark McKenzie', 15], ['Malik Tillman', 17], ['Giovanni Reyna', 7], ['Ricardo Pepi', 9], ['Brenden Aaronson', 11],
  ]),
  marruecos: squad('4-3-3', [
    ['Yassine Bounou', 1, 3], ['Noussair Mazraoui', 3, 2], ['Romain Saïss', 6], ['Nayef Aguerd', 5], ['Achraf Hakimi', 2, 6],
    ['Sofyan Amrabat', 4], ['Azzedine Ounahi', 8], ['Bilal El Khannouss', 23],
    ['Ez Abde', 16], ['Youssef En-Nesyri', 19, 2], ['Brahim Díaz', 10, 4],
    ['Munir Mohamedi', 12], ['Jawad El Yamiq', 18], ['Yahia Attiyat Allah', 25], ['Amir Richardson', 24], ['Hakim Ziyech', 7], ['Soufiane Rahimi', 9], ['Ayoub El Kaabi', 21],
  ]),
  senegal: squad('4-3-3', [
    ['Édouard Mendy', 16, 2], ['Ismail Jakobs', 14], ['Kalidou Koulibaly', 3, 3], ['Moussa Niakhaté', 19], ['Krépin Diatta', 15],
    ['Idrissa Gueye', 5], ['Pape Matar Sarr', 17, 3], ['Lamine Camara', 26],
    ['Sadio Mané', 10, 4], ['Nicolas Jackson', 7, 2], ['Ismaïla Sarr', 18, 2],
    ['Seny Dieng', 1], ['Abdoulaye Seck', 4], ['Youssouf Sabaly', 21], ['Pape Gueye', 8], ['Nampalys Mendy', 6], ['Boulaye Dia', 9], ['Iliman Ndiaye', 13],
  ]),
  japon: squad('4-2-3-1', [
    ['Zion Suzuki', 1], ['Hiroki Ito', 21], ['Ko Itakura', 4], ['Takehiro Tomiyasu', 16], ['Yukinari Sugawara', 2],
    ['Wataru Endo', 6, 2], ['Hidemasa Morita', 5],
    ['Kaoru Mitoma', 7, 4], ['Takumi Minamino', 8], ['Takefusa Kubo', 20, 4],
    ['Ayase Ueda', 9, 2],
    ['Keisuke Osako', 12], ['Shogo Taniguchi', 3], ['Koki Machida', 22], ['Ao Tanaka', 17], ['Daichi Kamada', 15], ['Ritsu Doan', 10], ['Daizen Maeda', 11],
  ]),
};
