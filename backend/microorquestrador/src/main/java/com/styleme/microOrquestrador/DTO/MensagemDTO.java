
package com.styleme.microOrquestrador.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class MensagemDTO {
    
    private String mensagem;
    private Long sagaId;
    private Object sendObj;
    private Object returnObj;
    
}