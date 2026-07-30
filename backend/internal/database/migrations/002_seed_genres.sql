INSERT INTO genres(name) VALUES
('Ambient'),('Blues'),('Classical'),('Country'),('Disco'),('Electronic'),('Experimental'),('Flamenco'),('Folk'),('Funk'),('Hip-Hop / Rap'),('Indie'),('Jazz'),('Latin'),('Metal'),('Pop'),('Punk'),('R&B / Soul'),('Reggae'),('Rock'),('Soundtrack'),('World'),('Other')
ON CONFLICT(name) DO NOTHING;
