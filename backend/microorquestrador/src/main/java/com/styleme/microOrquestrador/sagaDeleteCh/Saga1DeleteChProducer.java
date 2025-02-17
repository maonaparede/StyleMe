
package com.styleme.microOrquestrador.sagaDeleteCh;

import com.styleme.microOrquestrador.DTO.MensagemDTO;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class Saga1DeleteChProducer {

    @Autowired
    private AmqpTemplate template;
       
    //Primeiro da sequencia
    public void commitOrdem(MensagemDTO dto) {
        template.convertAndSend(ConfigQueueDeleteCh.queueChDeleteCh, dto);
        template.convertAndSend(ConfigQueueDeleteCh.queueChDeleteUs, dto);
    }

}
