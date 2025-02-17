const express = require('express');
const http = require('http');
const httpProxy = require('express-http-proxy');
const logger = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { default: axios } = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const port = 3001;
app.use(cors({ origin: 'http://localhost:3000' }));

app.use(express.json());

const tokenExpirationMin = 30; // Quantos minutos para o token expirar

const orquestradorServiceProxy = httpProxy(process.env.ORQUESTRADOR_API + "/api");
const jwtServiceProxy = httpProxy(process.env.AUTH_API + '/auth/login', {
  function(res) { console.log(res); return res },
  proxyReqOptDecorator: function (proxyReqOpts) {
    // Alteração do header
    proxyReqOpts.headers['Content-Type'] = 'application/json';
    proxyReqOpts.method = 'POST';
    return proxyReqOpts;
  },
  userResDecorator: function (proxyRes, proxyResData, _userReq, userRes) {
    // Processamento do token
    if (proxyRes.statusCode === 200) {
      try {
        const str = Buffer.from(proxyResData).toString('utf-8');
        const objBody = JSON.parse(str);
        if (!objBody.email) {
          throw new Error('Email is missing in response body');
        }

        const token = jwt.sign({ id: objBody.id, tipoUser: objBody.tipoUser, email: objBody.email }, '8morss2f135mor*5', {
          expiresIn: 144000, // Define o tempo de expiração do token
        });

        userRes.status(200);
        return { auth: true, token: token };

      } catch (e) {
        console.error(' - ERRO: ', e);
        return userRes.status(500).json({ message: 'Internal server error' });
      }
    } else {
      return userRes.status(401).json({ message: 'Login inválido!' });
    }
  },
});

function verifyJWT(req, res, next) {
  const token = req.headers['x-access-token'];
  if (!token) {
    return res.status(401).json({ auth: false, message: 'Token não fornecido.' });
  }

  jwt.verify(token, '8morss2f135mor*5', (err, decoded) => {
    if (err) {
      return res.status(401).json({ auth: false, message: 'Falha ao autenticar o token.' });
    }

    // se tudo estiver ok, salva no request para uso posterior
    let infoUser = { "id": decoded.id, "tipoUser": decoded.tipoUser, "email": decoded.email }
    req.infoUser = infoUser
    next();
  });
}

// ORQUESTRADOR
app.post('/api/orq/cadastro', (req, res, next) => orquestradorServiceProxy(req, res, next));

// AUTH
app.post('/api/auth/login', async (req, res, next) => { jwtServiceProxy(req, res, next); });

app.get(`/api/user`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;

  const response = await axios.get(`${process.env.USERS_API}/api/user/${jwtInfo.id}`);

  let email = jwtInfo.email;

  response.data.email = email;

  res.send(response.data);
});

// TELA INICIAL
app.get(`/api/ch`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;

  try {
    const response = await axios.get(`http://localhost:8083/api/ch/${jwtInfo.id}`);
    res.send(response.data);

  } catch (e) {
    console.log(e)
  }
});

// RANKING
app.get(`/api/user/ranking`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;

  const response = await axios.get(`http://localhost:8081/api/user/ranking/${jwtInfo.id}`);

  res.send(response.data);
});

// DESAFIOS CONCLUIDOS
app.get(`/api/ch/perfil`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;

  const response = await axios.get(`http://localhost:8083/api/ch/perfil/${jwtInfo.id}`);

  res.send(response.data);
});

// TELA DESAFIO
app.get(`/api/ch/des`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;
  let idChallenge = req.headers['id-challenge'];

  const response = await axios.get(`http://localhost:8083/api/ch/${jwtInfo.id}/${idChallenge}`);

  res.send(response.data);
});

// Desafio user id
app.post(`/api/ch/done`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser.id;
  let idChallenge = req.headers['id-challenge'];

  let objSend = {
    challengeId: idChallenge,
    userId: jwtInfo
  };

  try {
    const response = await axios.post(`http://localhost:8080/api/orq/chdone`, objSend);
    res.json(response.data); // Envia apenas os dados da resposta
  } catch (error) {
    console.error('Erro ao concluir desafio:', error);
    res.status(500).json({ message: 'Erro ao concluir desafio' });
  }
});

// Atualização do usuário
app.put('/api/user/up', verifyJWT, async (req, res) => {
  let idUser = req.infoUser.id;
  let username = req.headers['username'];
  let img = req.headers['img'];
  let imgtype = req.headers['img-type'];

  let payload = {
    idUser: idUser,
    username: username,
    imgtype: imgtype,
    img: img // img é uma string base64
  };

  try {
    const response = await axios.put('http://localhost:8081/api/user', payload, {
    });
    res.send(response.data);
  } catch (error) {
    console.error('Erro ao atualizar o perfil:', error);
    res.status(500).json({ message: 'Erro ao atualizar o perfil' });
  }
});

// RECUPERAÇÃO DE SENHA
app.get(`/api/rec/senha`, async (req, res) => {
  let email = req.headers['email'];

  const response = await axios.get(`http://localhost:8082/api/auth/recover/${email}`);

  res.send(response.data);
});

// ATUALIZAR SENHA
app.put('/api/password/up', verifyJWT, async (req, res) => {
  let emailReq = req.infoUser.email;
  let senhaReq = req.headers['senha'];
  let confirmarSenhaReq = req.headers['confirmar-senha'];

  let payload = {
    email: emailReq,
    senha: senhaReq,
    newsenha: confirmarSenhaReq,
  };

  try {
    const response = await axios.put('http://localhost:8082/api/auth', payload, {
      headers: {
        'Content-Type': 'application/json'
      },
    });
    res.send(response.data);
  } catch (error) {
    console.error('Erro ao atualizar a senha:', error);
    res.status(500).json({ message: 'Erro ao atualizar a senha' });
  }
});

app.get(`/api/tipo/user`, verifyJWT, async (req, res) => {
  let jwtInfo = req.infoUser;
  let tipoUser = jwtInfo.tipoUser;

  res.send(tipoUser);
}); 

app.delete(`/api/del/ch`, verifyJWT, async (req, res) => {
  let chId = req.headers['challenge-id'];

  try {
    const response = await axios.delete(`http://localhost:8080/api/orq/chdelete/${chId}`);
    res.send(response.data);
  } catch (error) {
    console.error('Erro ao excluir o desafio:', error);
    res.status(500).json({ message: 'Erro ao excluir o desafio' });
  }

}); 

app.post(`/api/cr/ch`, verifyJWT, async (req, res) => {

  let chTitle = req.headers['ch-title'];
  let chLevel = req.headers['ch-level'];
  let chDescription = req.headers['ch-description'];
  let chHtml = req.headers['ch-HTML'];
  let chCssBase = req.headers['ch-CssBase'];
  let chCssFinal = req.headers['ch-CssFinal'];
  

  let objSend = {
    title: chTitle,
    level: chLevel,
    description: chDescription,
    html: chHtml,
    cssBase: chCssBase,
    cssFinal: chCssFinal
  };

  try {
    const response = await axios.post(`http://localhost:8083/api/ch`, objSend);
    res.json(response.data);
  } catch (error) {
    console.error('Erro ao criar o desafio:', error);
    res.status(500).json({ message: 'Erro ao criar o desafio' });
  }
});

app.get(`/api/user/exists`, async (req, res) => {
  let username = req.headers['username'];

  const response = await axios.get(`http://localhost:8081/api/user/usernameExists/${username}`);

  res.send(response.data);
});

app.get(`/api/email/exists`, async (req, res) => {
  let email = req.headers['email'];

  const response = await axios.get(`http://localhost:8082/api/auth/emailexists/${email}`);

  res.send(response.data);
});

app.put('/api/ch/up', async (req, res) => {

  let payload = {
    id: req.body.objSend.id,
    title: req.body.objSend.title,
    level: req.body.objSend.level,
    description: req.body.objSend.description,
    html: req.body.objSend.html,
    cssBase: req.body.objSend.cssBase,
    cssFinal: req.body.objSend.cssFinal,
  };

  try {
    const response = await axios.put('http://localhost:8083/api/ch', payload, {
      headers: {
        'Content-Type': 'application/json'
      },
    });
    res.send(response.data);
  } catch (error) {
    console.error('Erro ao atualizar o desafio:', error);
    res.status(500).json({ message: 'Erro ao atualizar o desafio' });
  }
});

// Configuração da aplicação
app.use(logger('dev'));
app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
